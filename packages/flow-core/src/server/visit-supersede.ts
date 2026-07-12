import type { DatabaseSync } from 'node:sqlite';
import type { ResolveBusinessDay, Visit, VisitEvent, VisitView } from '@praxis-flow/flow-core';
import {
  TERMINAL_VISIT_STATUSES,
  effectiveEscortPolicy,
  formatTicketCode,
  formatVisitId,
  journeyStepLabel,
  laneCounterScope,
  lastKnownFromJourneyStep,
  movementTerminalInstruction,
  resolveLaneCodeForCheckIn,
  ruleForTopicAtSurface,
  stepToVisitPatch,
} from '@praxis-flow/flow-core';
import { resolveCheckInRouting } from './escort.js';
import { allocateQueueSequence } from './queue-counter.js';
import type { CatalogRepository } from './catalog-repository.js';
import type { VisitRepository } from './visit-repository.js';
import { runInTransaction } from './unit-of-work.js';

export type SupersedeRequest = {
  topicId: string;
  /** Wartezeit-Anker behalten: checkedInAt (+ arrivedAt falls gesetzt). Default true. */
  preserveArrivedAt?: boolean;
  surfaceId?: string;
  staffNote?: string;
  /** Actor für cancelled/superseded/checked_in Events. Default `system` (Host setzt z. B. `mfa`). */
  actorType?: VisitEvent['actorType'];
};

export type SupersedeResult = {
  superseded: VisitView;
  visit: VisitView;
  correlationId: string;
};

export const VISIT_INSERT_SQL = `INSERT INTO visits (
  id, patient_id, status, primary_topic_id, applied_routing_rule_id,
  last_known_location_id, target_location_id, queue_id, last_surface_id,
  movement_mode, location_confidence, public_display_mode,
  queue_number, queue_number_date, queue_number_scope, queue_lane_code, queue_sequence,
  needs_assistance, check_in_path, auth_path,
  configured_escort_policy, effective_escort_policy, allow_redirect,
  terminal_instruction, staff_note,
  checked_in_at, called_at, arrived_at, started_at, finished_at,
  journey_template_id, journey_step_index, journey_step_completed_at, journey_state,
  supersedes_visit_id, superseded_by_visit_id,
  created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function resolveTopicRouting(
  catalogRepository: CatalogRepository,
  params: {
    topicId: string;
    surfaceId: string;
    effectivePolicy: Visit['effectiveEscortPolicy'];
  },
) {
  const data = catalogRepository.loadCatalog();
  const selectedTopic = data.topics.find((item) => item.id === params.topicId && item.active);
  const selectedRule = ruleForTopicAtSurface(data, params.topicId, params.surfaceId);
  if (!selectedTopic) throw new Error('TOPIC_OR_ROUTING_RULE_MISSING');
  if (!selectedRule) {
    const hasActiveRule = data.routingRules.some(
      (item) => item.topicId === params.topicId && item.active,
    );
    throw new Error(
      hasActiveRule ? 'TOPIC_NOT_ALLOWED_AT_SURFACE' : 'TOPIC_OR_ROUTING_RULE_MISSING',
    );
  }

  const useJourney = Boolean(selectedRule.journeyTemplateId);
  const templateSteps = useJourney
    ? catalogRepository.stepsForTemplate(selectedRule.journeyTemplateId!, data.journeySteps)
    : [];
  const journeyStep0 = templateSteps[0];
  if (useJourney && !journeyStep0) throw new Error('JOURNEY_STEP_MISSING');

  let visitLastKnown: string | null;
  let visitTarget: string | null;
  let visitQueue: string | null;
  let visitMovement: Visit['movementMode'];
  let visitDisplay: Visit['publicDisplayMode'];
  let visitStatus: Visit['status'];
  let visitConfidence: Visit['locationConfidence'];
  let visitTerminalInstruction: string;
  let journeyTemplateId: string | null = null;
  let journeyStepIndex: number | null = null;
  let journeyState: Visit['journeyState'] | null = null;
  let routeNote = selectedRule.name;

  if (useJourney && journeyStep0) {
    const target = data.locations.find((location) => location.id === journeyStep0.targetLocationId);
    const stepPatch = stepToVisitPatch(
      journeyStep0,
      { effectiveEscortPolicy: params.effectivePolicy },
      { targetLocation: target },
    );
    visitLastKnown = lastKnownFromJourneyStep(journeyStep0, data.queues);
    visitTarget = stepPatch.targetLocationId;
    visitQueue = stepPatch.queueId;
    visitMovement = stepPatch.movementMode;
    visitDisplay = stepPatch.publicDisplayMode;
    visitStatus = stepPatch.status;
    visitConfidence = 'assumed';
    visitTerminalInstruction =
      stepPatch.terminalInstruction ??
      movementTerminalInstruction({
        movementMode: stepPatch.movementMode,
        targetLocation: target,
      });
    journeyTemplateId = selectedRule.journeyTemplateId ?? null;
    journeyStepIndex = 0;
    journeyState = 'active';
    routeNote = `Journey Schritt ${journeyStepLabel(templateSteps, 0)} · ${selectedRule.name}`;
  } else {
    const routing = resolveCheckInRouting({
      selectedRule,
      effectiveEscortPolicy: params.effectivePolicy,
      locations: data.locations,
    });
    visitLastKnown = routing.lastKnownLocationId ?? null;
    visitTarget = routing.targetLocationId ?? null;
    visitQueue = routing.queueId ?? null;
    visitMovement = routing.movementMode;
    visitDisplay = selectedRule.publicDisplayMode;
    visitStatus = routing.status;
    visitConfidence = routing.locationConfidence;
    visitTerminalInstruction = routing.terminalInstruction;
  }

  return {
    selectedTopic,
    selectedRule,
    visitLastKnown,
    visitTarget,
    visitQueue,
    visitMovement,
    visitDisplay,
    visitStatus,
    visitConfidence,
    visitTerminalInstruction,
    journeyTemplateId,
    journeyStepIndex,
    journeyState,
    routeNote,
    checkedInNote: selectedTopic.name,
  };
}

export function supersedeVisit(params: {
  db: DatabaseSync;
  catalogRepository: CatalogRepository;
  visitRepository: VisitRepository;
  maybeFail: (label: string) => void;
  resolveBusinessDay: ResolveBusinessDay;
  visitId: string;
  body: SupersedeRequest;
}): SupersedeResult {
  const { db, catalogRepository, visitRepository, maybeFail, resolveBusinessDay, visitId, body } =
    params;
  const { visitById, updateVisit, addEvent } = visitRepository;

  return runInTransaction(db, () => {
    const topicId = body.topicId?.trim();
    if (!topicId) throw new Error('SUPERSEDE_TOPIC_REQUIRED');

    const current = visitById(visitId);
    if (!current) throw new Error('VISIT_NOT_FOUND');
    if (TERMINAL_VISIT_STATUSES.has(current.status as 'done' | 'cancelled' | 'no_show')) {
      throw new Error('SUPERSEDE_SOURCE_TERMINAL');
    }
    if (current.supersededByVisitId) throw new Error('SUPERSEDE_ALREADY_SUPERSEDED');
    if (current.primaryTopicId === topicId) throw new Error('SUPERSEDE_SAME_TOPIC');

    const surfaceId = body.surfaceId?.trim() || current.lastSurfaceId || 'terminal_1';
    const data = catalogRepository.loadCatalog();
    const selectedRulePreview = ruleForTopicAtSurface(data, topicId, surfaceId);
    if (!selectedRulePreview) {
      const hasActiveRule = data.routingRules.some(
        (item) => item.topicId === topicId && item.active,
      );
      throw new Error(
        hasActiveRule ? 'TOPIC_NOT_ALLOWED_AT_SURFACE' : 'TOPIC_OR_ROUTING_RULE_MISSING',
      );
    }
    const configuredEscortPolicy = selectedRulePreview.escortPolicy;
    const effectivePolicy = effectiveEscortPolicy(configuredEscortPolicy);
    const routing = resolveTopicRouting(catalogRepository, { topicId, surfaceId, effectivePolicy });

    const now = new Date().toISOString();
    const businessDay = current.queueNumberDate || resolveBusinessDay(new Date(now));
    const queueLaneCode = resolveLaneCodeForCheckIn(routing.selectedTopic);
    maybeFail('supersede:queueNumber');
    const queueSequence = allocateQueueSequence(db, {
      scope: laneCounterScope(queueLaneCode),
      date: businessDay,
    });
    const queueNumber = formatTicketCode(queueLaneCode, queueSequence);
    const newVisitId = formatVisitId(businessDay, queueLaneCode, queueSequence);
    const correlationId = crypto.randomUUID();
    const preserveArrivedAt = body.preserveArrivedAt !== false;
    const checkedInAt = preserveArrivedAt ? (current.checkedInAt ?? current.createdAt) : now;
    const arrivedAt = preserveArrivedAt ? (current.arrivedAt ?? null) : null;
    const staffNote = body.staffNote !== undefined ? body.staffNote : (current.staffNote ?? null);
    const actorType = body.actorType ?? 'system';

    maybeFail('supersede:insert');
    db.prepare(VISIT_INSERT_SQL).run(
      newVisitId,
      current.patientId,
      routing.visitStatus,
      routing.selectedTopic.id,
      routing.selectedRule.id,
      routing.visitLastKnown,
      routing.visitTarget,
      routing.visitQueue,
      surfaceId,
      routing.visitMovement,
      routing.visitConfidence,
      routing.visitDisplay,
      queueNumber,
      businessDay,
      'lane_day',
      queueLaneCode,
      queueSequence,
      current.needsAssistance ? 1 : 0,
      'topic',
      current.authPath,
      configuredEscortPolicy,
      effectivePolicy,
      routing.selectedRule.allowRedirect ? 1 : 0,
      routing.visitTerminalInstruction,
      staffNote,
      checkedInAt,
      null,
      arrivedAt,
      null,
      null,
      routing.journeyTemplateId,
      routing.journeyStepIndex,
      null,
      routing.journeyState,
      current.id,
      null,
      now,
      now,
    );
    db.prepare('INSERT INTO visit_topics VALUES (?, ?, ?, ?, ?)').run(
      crypto.randomUUID(),
      newVisitId,
      routing.selectedTopic.id,
      1,
      'open',
    );

    maybeFail('supersede:closeSource');
    updateVisit(current, {
      status: 'cancelled',
      finishedAt: now,
      supersededByVisitId: newVisitId,
    });

    maybeFail('supersede:events');
    addEvent(
      current.id,
      'cancelled',
      current.status,
      'cancelled',
      current.lastKnownLocationId,
      current.targetLocationId,
      current.queueId,
      current.queueId,
      actorType,
      `superseded by ${newVisitId}`,
      { correlationId },
    );
    addEvent(
      current.id,
      'superseded',
      current.status,
      'cancelled',
      current.lastKnownLocationId,
      current.targetLocationId,
      current.queueId,
      current.queueId,
      actorType,
      newVisitId,
      { correlationId },
    );
    addEvent(
      newVisitId,
      'checked_in',
      null,
      routing.visitStatus,
      null,
      routing.visitLastKnown,
      null,
      routing.visitQueue,
      actorType,
      routing.checkedInNote,
      { correlationId },
    );
    addEvent(
      newVisitId,
      'routed',
      null,
      routing.visitStatus,
      null,
      routing.visitTarget,
      null,
      routing.visitQueue,
      'system',
      routing.routeNote,
      { correlationId },
    );
    addEvent(
      newVisitId,
      'superseded',
      null,
      routing.visitStatus,
      null,
      routing.visitTarget,
      null,
      routing.visitQueue,
      actorType,
      `supersedes ${current.id}`,
      { correlationId },
    );

    const superseded = visitById(current.id);
    const visit = visitById(newVisitId);
    if (!superseded || !visit) throw new Error('VISIT_NOT_FOUND');
    return { superseded, visit, correlationId };
  });
}
