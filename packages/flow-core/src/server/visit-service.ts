import type { DatabaseSync } from 'node:sqlite';
import type {
  ResolveBusinessDay,
  TransitionAction,
  Visit,
  VisitEvent,
  VisitView,
} from '@praxis-flow/flow-core';
import {
  MFA_ASSIST_TOPIC_ID,
  effectiveEscortPolicy,
  movementTerminalInstruction,
  ruleForTopicAtSurface,
  formatJourneyNextStepNote,
  lastKnownFromJourneyStep,
  resolveRedirectVisitPatch,
  effectiveRedirectQueueId,
  effectiveRedirectTargetLocationId,
  assertTransitionAllowed,
  completeJourneyStepPatch,
  journeyStepLabel,
  startNextJourneyStepPatch,
  stepToVisitPatch,
  type JourneyProgressionPatch,
  type VisitPatch,
  validateRedirectRequest,
  laneCounterScope,
  resolveLaneCodeForCheckIn,
  formatTicketCode,
  formatVisitId,
  assertActingLocationScope,
  assertCallTargetLocation,
  resolveReturnToWaitingVisitPatch,
  statusForMovementMode,
} from '@praxis-flow/flow-core';
import type { RedirectRequestBody } from '@praxis-flow/flow-core';
import { resolveCheckInRouting } from './escort.js';
import { resolveQueueOnArrival } from './location-routing.js';
import { allocateQueueSequence } from './queue-counter.js';
import type { CatalogRepository } from './catalog-repository.js';
import type { VisitRepository } from './visit-repository.js';
import { runInTransaction } from './unit-of-work.js';
import { supersedeVisit, type SupersedeRequest, type SupersedeResult } from './visit-supersede.js';
import { ensureVisitSupersedeColumns } from './visit-supersede-schema.js';

export type { SupersedeRequest, SupersedeResult } from './visit-supersede.js';

/** Check-in ohne Supersede-Spalten — funktioniert vor und nach ensureVisitSupersedeColumns. */
const CHECKIN_VISIT_INSERT_SQL = `INSERT INTO visits (
  id, patient_id, status, primary_topic_id, applied_routing_rule_id,
  last_known_location_id, target_location_id, queue_id, last_surface_id,
  movement_mode, location_confidence, public_display_mode,
  queue_number, queue_number_date, queue_number_scope, queue_lane_code, queue_sequence,
  needs_assistance, check_in_path, auth_path,
  configured_escort_policy, effective_escort_policy, allow_redirect,
  terminal_instruction, staff_note,
  checked_in_at, called_at, arrived_at, started_at, finished_at,
  journey_template_id, journey_step_index, journey_step_completed_at, journey_state,
  created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

type CheckInBody = {
  topicId?: string;
  mfaAssist?: boolean;
  authPath?: Visit['authPath'];
  surfaceId?: string;
  displayName?: string;
  needsAssistance?: boolean;
  staffNote?: string;
};

type TransitionContext = {
  targetLocationId?: string | null;
  actingLocationId?: string;
  actorSurfaceId?: string;
  actorId?: string;
};

type CancelContext = {
  actorType?: VisitEvent['actorType'];
  actorId?: string;
  note?: string;
};

type ReassignTargetContext = {
  targetLocationId: string;
  actorType?: VisitEvent['actorType'];
  actorId?: string;
  note?: string;
};

export function createVisitService(params: {
  db: DatabaseSync;
  catalogRepository: CatalogRepository;
  visitRepository: VisitRepository;
  maybeFail: (label: string) => void;
  resolveBusinessDay: ResolveBusinessDay;
}) {
  const { db, catalogRepository, visitRepository, maybeFail, resolveBusinessDay } = params;
  const { loadCatalog, stepsForTemplate } = catalogRepository;
  const { visitById, updateVisit, addEvent } = visitRepository;

  const applyJourneyPatch = (
    visitId: string,
    current: VisitView,
    patch: JourneyProgressionPatch,
    steps: ReturnType<typeof stepsForTemplate>,
  ): VisitView => {
    maybeFail('journeyProgression:update');
    updateVisit(current, patch);
    const after = visitById(visitId)!;
    const data = loadCatalog();
    const fromLocation = data.locations.find((item) => item.id === current.targetLocationId);
    const toLocation = data.locations.find((item) => item.id === after.targetLocationId);
    maybeFail('journeyProgression:event');
    if ('journeyState' in patch && patch.journeyState === 'completed') {
      addEvent(
        visitId,
        'journey_completed',
        current.status,
        after.status,
        current.targetLocationId,
        after.targetLocationId,
        current.queueId,
        after.queueId,
        'system',
        formatJourneyNextStepNote({
          previousIndex: current.journeyStepIndex!,
          nextIndex: null,
          stepCount: steps.length,
          fromLocationName: fromLocation?.name,
          toLocationName: toLocation?.name,
        }),
      );
    } else if ('journeyStepIndex' in patch) {
      addEvent(
        visitId,
        'routed',
        current.status,
        after.status,
        current.targetLocationId,
        after.targetLocationId,
        current.queueId,
        after.queueId,
        'system',
        formatJourneyNextStepNote({
          previousIndex: current.journeyStepIndex!,
          nextIndex: patch.journeyStepIndex ?? null,
          stepCount: steps.length,
          fromLocationName: fromLocation?.name,
          toLocationName: toLocation?.name,
        }),
      );
    } else if ('journeyStepCompletedAt' in patch) {
      addEvent(
        visitId,
        'journey_step_completed',
        current.status,
        after.status,
        current.targetLocationId,
        after.targetLocationId,
        current.queueId,
        after.queueId,
        'system',
        `Journey Schritt ${journeyStepLabel(steps, current.journeyStepIndex) ?? ''} erledigt`.trim(),
      );
    }
    return after;
  };

  const applyJourneyProgression = (
    visitId: string,
    action: TransitionAction,
    completedAt: string,
  ): VisitView | undefined => {
    const updated = visitById(visitId);
    if (!updated?.journeyTemplateId || updated.journeyStepIndex == null) return updated;

    const data = loadCatalog();
    const steps = stepsForTemplate(updated.journeyTemplateId, data.journeySteps);
    const journeyPatch = completeJourneyStepPatch(updated, action, steps, {
      completedAt,
      locations: data.locations,
    });
    if (!journeyPatch) return updated;
    return applyJourneyPatch(visitId, updated, journeyPatch, steps);
  };

  const startNextJourneyStep = (visitId: string): VisitView | undefined => {
    const current = visitById(visitId);
    if (
      !current?.journeyTemplateId ||
      current.journeyStepIndex == null ||
      !current.journeyStepCompletedAt
    ) {
      throw new Error('START_NEXT_JOURNEY_STEP_NOT_ALLOWED');
    }
    const data = loadCatalog();
    const steps = stepsForTemplate(current.journeyTemplateId, data.journeySteps);
    const journeyPatch = startNextJourneyStepPatch(current, steps, { locations: data.locations });
    if (!journeyPatch || journeyPatch.journeyState === 'completed') {
      throw new Error('START_NEXT_JOURNEY_STEP_NOT_ALLOWED');
    }
    return applyJourneyPatch(visitId, current, journeyPatch, steps);
  };

  const checkIn = (body: CheckInBody): VisitView | undefined =>
    runInTransaction(db, () => {
      const data = loadCatalog();
      const mfaAssist = Boolean(body.mfaAssist);
      const needsAssistance = Boolean(body.needsAssistance);
      const resolvedTopicId = mfaAssist ? MFA_ASSIST_TOPIC_ID : body.topicId!;
      const checkInPath = mfaAssist ? 'mfa_assist' : 'topic';
      const surfaceId = body.surfaceId ?? 'terminal_1';

      const checkInSurface = data.surfaces.find((item) => item.id === surfaceId && item.enabled);
      if (!checkInSurface || checkInSurface.type !== 'terminal')
        throw new Error('CHECKIN_SURFACE_INVALID');

      const selectedTopic = data.topics.find((item) => item.id === resolvedTopicId && item.active);
      const selectedRule = ruleForTopicAtSurface(data, resolvedTopicId, surfaceId);
      if (!selectedTopic) throw new Error('TOPIC_OR_ROUTING_RULE_MISSING');
      if (!selectedRule) {
        const hasActiveRule = data.routingRules.some(
          (item) => item.topicId === resolvedTopicId && item.active,
        );
        throw new Error(
          hasActiveRule ? 'TOPIC_NOT_ALLOWED_AT_SURFACE' : 'TOPIC_OR_ROUTING_RULE_MISSING',
        );
      }

      const now = new Date().toISOString();
      const businessDay = resolveBusinessDay(new Date(now));
      const queueLaneCode = resolveLaneCodeForCheckIn(selectedTopic);
      const queueScope = 'lane_day' as const;
      maybeFail('checkIn:queueNumber');
      const queueSequence = allocateQueueSequence(db, {
        scope: laneCounterScope(queueLaneCode),
        date: businessDay,
      });
      const queueNumber = formatTicketCode(queueLaneCode, queueSequence);
      const visitId = formatVisitId(businessDay, queueLaneCode, queueSequence);
      const authPath = body.authPath ?? (mfaAssist ? 'none' : 'phone_dob');
      const patientId = crypto.randomUUID();

      const configuredEscortPolicy = selectedRule.escortPolicy;
      const effectivePolicy = effectiveEscortPolicy(configuredEscortPolicy);
      const allowRedirect = selectedRule.allowRedirect;
      const visitNeedsAssistance = checkInPath === 'topic' && needsAssistance;

      const useJourney = Boolean(selectedRule.journeyTemplateId);
      const templateSteps = useJourney
        ? stepsForTemplate(selectedRule.journeyTemplateId!, data.journeySteps)
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
      const checkedInNote = selectedTopic.name;
      let routeNote = selectedRule.name;

      if (useJourney && journeyStep0) {
        const target = data.locations.find(
          (location) => location.id === journeyStep0.targetLocationId,
        );
        const stepPatch = stepToVisitPatch(
          journeyStep0,
          { effectiveEscortPolicy: effectivePolicy },
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
          effectiveEscortPolicy: effectivePolicy,
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

      maybeFail('checkIn:patient');
      db.prepare('INSERT INTO patients VALUES (?, ?, ?, ?)').run(
        patientId,
        body.displayName || null,
        body.displayName ? 0 : 1,
        now,
      );
      maybeFail('checkIn:visit');
      db.prepare(CHECKIN_VISIT_INSERT_SQL).run(
        visitId,
        patientId,
        visitStatus,
        selectedTopic.id,
        selectedRule.id,
        visitLastKnown,
        visitTarget,
        visitQueue,
        surfaceId,
        visitMovement,
        visitConfidence,
        visitDisplay,
        queueNumber,
        businessDay,
        queueScope,
        queueLaneCode,
        queueSequence,
        visitNeedsAssistance ? 1 : 0,
        checkInPath,
        authPath,
        configuredEscortPolicy,
        effectivePolicy,
        allowRedirect ? 1 : 0,
        visitTerminalInstruction,
        body.staffNote ?? null,
        now,
        null,
        null,
        null,
        null,
        journeyTemplateId,
        journeyStepIndex,
        null,
        journeyState,
        now,
        now,
      );
      maybeFail('checkIn:visitTopic');
      db.prepare('INSERT INTO visit_topics VALUES (?, ?, ?, ?, ?)').run(
        crypto.randomUUID(),
        visitId,
        selectedTopic.id,
        1,
        'open',
      );
      maybeFail('checkIn:event:checked_in');
      addEvent(
        visitId,
        'checked_in',
        null,
        visitStatus,
        null,
        visitLastKnown,
        null,
        visitQueue,
        'terminal',
        checkedInNote,
        { actorId: surfaceId },
      );
      maybeFail('checkIn:event:routed');
      addEvent(
        visitId,
        'routed',
        null,
        visitStatus,
        null,
        visitTarget,
        null,
        visitQueue,
        'system',
        routeNote,
      );
      return visitById(visitId);
    });

  const supersede = (id: string, body: SupersedeRequest): SupersedeResult => {
    ensureVisitSupersedeColumns(db);
    return supersedeVisit({
      db,
      catalogRepository,
      visitRepository,
      maybeFail,
      resolveBusinessDay,
      visitId: id,
      body,
    });
  };

  const transition = (
    visitId: string,
    action: TransitionAction,
    context: TransitionContext = {},
  ): VisitView | undefined =>
    runInTransaction(db, () => {
      const current = visitById(visitId);
      if (!current) throw new Error('VISIT_NOT_FOUND');
      assertTransitionAllowed(current, action, context);
      assertActingLocationScope(current, context.actingLocationId);
      const now = new Date().toISOString();
      if (action === 'call') {
        const data = loadCatalog();
        if (context.targetLocationId) {
          assertCallTargetLocation(data, context.targetLocationId);
        }
        const callPatch: VisitPatch = {
          status: 'called',
          locationConfidence: 'instructed',
          calledAt: now,
          arrivedAt: null,
        };
        if (context.targetLocationId) {
          callPatch.targetLocationId = context.targetLocationId;
        }
        maybeFail('transition:update');
        updateVisit(current, callPatch);
        const afterCall = visitById(visitId)!;
        maybeFail('transition:event');
        addEvent(
          visitId,
          'called',
          current.status,
          'called',
          current.lastKnownLocationId,
          afterCall.targetLocationId,
          current.queueId,
          afterCall.queueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else if (action === 'arrive') {
        const data = loadCatalog();
        const nextQueueId = resolveQueueOnArrival(
          current.queueId,
          current.targetLocationId,
          data.queues,
        );
        maybeFail('transition:update');
        updateVisit(current, {
          status: 'arrived',
          lastKnownLocationId: current.targetLocationId,
          queueId: nextQueueId,
          locationConfidence: 'confirmed',
          arrivedAt: now,
        });
        maybeFail('transition:event');
        addEvent(
          visitId,
          'arrived',
          current.status,
          'arrived',
          current.lastKnownLocationId,
          current.targetLocationId,
          current.queueId,
          nextQueueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else if (action === 'start') {
        maybeFail('transition:update');
        updateVisit(current, { status: 'in_progress', startedAt: now });
        maybeFail('transition:event');
        addEvent(
          visitId,
          'started',
          current.status,
          'in_progress',
          current.lastKnownLocationId,
          current.targetLocationId,
          current.queueId,
          current.queueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else if (action === 'done') {
        const data = loadCatalog();
        const steps =
          current.journeyTemplateId != null
            ? stepsForTemplate(current.journeyTemplateId, data.journeySteps)
            : [];
        const currentStep =
          current.journeyStepIndex != null ? steps[current.journeyStepIndex] : undefined;
        const hasNextJourneyStep =
          current.journeyTemplateId != null &&
          current.journeyStepIndex != null &&
          currentStep?.completedWhen === 'done' &&
          steps[current.journeyStepIndex + 1] != null;
        const donePatch: VisitPatch = hasNextJourneyStep
          ? { status: current.status === 'arrived' ? 'in_progress' : current.status }
          : { status: 'done', finishedAt: now };
        if (current.status === 'arrived' && context.actingLocationId) {
          donePatch.startedAt = current.startedAt ?? current.arrivedAt ?? now;
        }
        maybeFail('transition:update');
        updateVisit(current, donePatch);
        const afterDone = visitById(visitId)!;
        maybeFail('transition:event');
        addEvent(
          visitId,
          'done',
          current.status,
          afterDone.status,
          current.lastKnownLocationId,
          current.targetLocationId,
          current.queueId,
          current.queueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else if (action === 'return_to_waiting') {
        // Recall, kein Redirect: journeyState bleibt unveraendert (kein passendes completedWhen).
        const data = loadCatalog();
        const returnPatch = resolveReturnToWaitingVisitPatch(current, data);
        const nextStatus = returnPatch.status ?? current.status;
        maybeFail('transition:update');
        updateVisit(current, returnPatch);
        const afterReturn = visitById(visitId)!;
        maybeFail('transition:event');
        addEvent(
          visitId,
          'returned_to_waiting',
          current.status,
          nextStatus,
          current.targetLocationId,
          afterReturn.lastKnownLocationId,
          current.queueId,
          afterReturn.queueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else if (action === 'start_next_journey_step') {
        return startNextJourneyStep(visitId);
      } else {
        throw new Error('UNKNOWN_ACTION');
      }
      return applyJourneyProgression(visitId, action, now);
    });

  const redirect = (visitId: string, body: RedirectRequestBody): VisitView | undefined =>
    runInTransaction(db, () => {
      const current = visitById(visitId);
      if (!current) throw new Error('VISIT_NOT_FOUND');
      validateRedirectRequest(loadCatalog(), current, body);
      const data = loadCatalog();
      const effectiveTargetLocationId = effectiveRedirectTargetLocationId(body, current);
      const effectiveQueueId = effectiveRedirectQueueId(body, current);
      const targetLocation = effectiveTargetLocationId
        ? data.locations.find((item) => item.id === effectiveTargetLocationId)
        : undefined;
      const wasOnJourney = current.journeyStepIndex != null || current.journeyState === 'active';
      const patch = resolveRedirectVisitPatch(current, body, { targetLocation });
      if (wasOnJourney) {
        patch.journeyState = 'abandoned';
      }
      const nextStatus = patch.status;
      maybeFail('redirect:update');
      updateVisit(current, patch);
      if (wasOnJourney) {
        maybeFail('redirect:journeyExit');
        const correlationId = crypto.randomUUID();
        addEvent(
          visitId,
          'journey_abandoned',
          current.status,
          nextStatus,
          current.targetLocationId,
          effectiveTargetLocationId ?? null,
          current.queueId,
          effectiveQueueId ?? null,
          'system',
          'wegen Redirect',
          { correlationId },
        );
        maybeFail('redirect:event');
        addEvent(
          visitId,
          'redirected',
          current.status,
          nextStatus,
          current.targetLocationId,
          effectiveTargetLocationId ?? null,
          current.queueId,
          effectiveQueueId ?? null,
          'mfa',
          body.staffNote ?? null,
          { correlationId, actorId: body.actorId },
        );
      } else {
        maybeFail('redirect:event');
        addEvent(
          visitId,
          'redirected',
          current.status,
          nextStatus,
          current.targetLocationId,
          effectiveTargetLocationId ?? null,
          current.queueId,
          effectiveQueueId ?? null,
          'mfa',
          body.staffNote ?? null,
          { actorId: body.actorId },
        );
      }
      return visitById(visitId);
    });

  const cancel = (visitId: string, context: CancelContext = {}): VisitView | undefined =>
    runInTransaction(db, () => {
      const current = visitById(visitId);
      if (!current) throw new Error('VISIT_NOT_FOUND');
      if (
        !['waiting', 'directed', 'called', 'arrived', 'in_progress', 'blocked'].includes(
          current.status,
        )
      ) {
        throw new Error('CANCEL_NOT_ALLOWED');
      }

      const now = new Date().toISOString();
      const wasOnJourney = current.journeyState === 'active' || current.journeyStepIndex != null;
      const correlationId = wasOnJourney ? crypto.randomUUID() : undefined;
      maybeFail('cancel:update');
      updateVisit(current, {
        status: 'cancelled',
        finishedAt: now,
        ...(wasOnJourney ? { journeyState: 'abandoned' } : {}),
      });

      if (wasOnJourney) {
        maybeFail('cancel:journeyExit');
        addEvent(
          visitId,
          'journey_abandoned',
          current.status,
          'cancelled',
          current.targetLocationId,
          current.targetLocationId,
          current.queueId,
          current.queueId,
          'system',
          'wegen Abbruch',
          { correlationId },
        );
      }

      maybeFail('cancel:event');
      addEvent(
        visitId,
        'cancelled',
        current.status,
        'cancelled',
        current.targetLocationId,
        current.targetLocationId,
        current.queueId,
        current.queueId,
        context.actorType ?? 'mfa',
        context.note,
        { correlationId, actorId: context.actorId },
      );
      return visitById(visitId);
    });

  const reassignTarget = (visitId: string, context: ReassignTargetContext): VisitView | undefined =>
    runInTransaction(db, () => {
      const current = visitById(visitId);
      if (!current) throw new Error('VISIT_NOT_FOUND');
      if (!['called', 'arrived', 'in_progress'].includes(current.status)) {
        throw new Error('REASSIGN_TARGET_NOT_ALLOWED');
      }

      const data = loadCatalog();
      assertCallTargetLocation(data, context.targetLocationId);
      if (current.targetLocationId === context.targetLocationId) return current;

      const targetLocation = data.locations.find((item) => item.id === context.targetLocationId);
      const now = new Date().toISOString();
      const nextStatus =
        current.movementMode === 'call' ? 'called' : statusForMovementMode(current.movementMode);
      maybeFail('reassignTarget:update');
      updateVisit(current, {
        status: nextStatus,
        targetLocationId: context.targetLocationId,
        locationConfidence: 'instructed',
        terminalInstruction: movementTerminalInstruction({
          movementMode: current.movementMode,
          targetLocation,
        }),
        calledAt: current.movementMode === 'call' ? now : null,
        arrivedAt: null,
        startedAt: null,
      });

      maybeFail('reassignTarget:event');
      addEvent(
        visitId,
        'target_reassigned',
        current.status,
        nextStatus,
        current.targetLocationId,
        context.targetLocationId,
        current.queueId,
        current.queueId,
        context.actorType ?? 'mfa',
        context.note,
        { actorId: context.actorId },
      );
      return visitById(visitId);
    });

  return { checkIn, supersede, transition, redirect, cancel, reassignTarget };
}

export type VisitService = ReturnType<typeof createVisitService>;
