import type { DatabaseSync } from 'node:sqlite';
import type { ResolveBusinessDay, TransitionAction, Visit, VisitView } from '@praxis-flow/flow-core';
import {
  MFA_ASSIST_TOPIC_ID,
  effectiveEscortPolicy,
  movementTerminalInstruction,
  ruleForTopicAtSurface,
  formatJourneyAdvanceNote,
  lastKnownFromJourneyStep,
  resolveRedirectVisitPatch,
  assertTransitionAllowed,
  advanceJourneyPatch,
  journeyStepLabel,
  stepToVisitPatch,
  validateRedirectRequest,
  laneCounterScope,
  resolveLaneCodeForCheckIn,
  formatTicketCode,
  formatVisitId,
  assertActingLocationScope,
  assertCallTargetLocation,
  resolveReturnToWaitingVisitPatch,
} from '@praxis-flow/flow-core';
import type { RedirectRequestBody } from '@praxis-flow/flow-core';
import { resolveCheckInRouting } from './escort.js';
import { resolveQueueOnArrival } from './location-routing.js';
import { allocateQueueSequence } from './queue-counter.js';
import type { CatalogRepository } from './catalog-repository.js';
import type { VisitRepository } from './visit-repository.js';
import { runInTransaction } from './unit-of-work.js';

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

  const applyJourneyAdvance = (visitId: string, action: TransitionAction): VisitView | undefined => {
    const updated = visitById(visitId);
    if (!updated?.journeyTemplateId || updated.journeyStepIndex == null) return updated;

    const data = loadCatalog();
    const steps = stepsForTemplate(updated.journeyTemplateId, data.journeySteps);
    const advancePatch = advanceJourneyPatch(updated, action, steps, { locations: data.locations });
    if (!advancePatch) return updated;

    maybeFail('journeyAdvance:update');
    updateVisit(updated, advancePatch as Partial<Visit>);
    const after = visitById(visitId)!;
    const fromLocation = data.locations.find((item) => item.id === updated.targetLocationId);
    const toLocation = data.locations.find((item) => item.id === after.targetLocationId);
    maybeFail('journeyAdvance:event');
    if (advancePatch.journeyState === 'completed') {
      addEvent(
        visitId,
        'journey_completed',
        updated.status,
        after.status,
        updated.targetLocationId,
        after.targetLocationId,
        updated.queueId,
        after.queueId,
        'system',
        formatJourneyAdvanceNote({
          previousIndex: updated.journeyStepIndex,
          nextIndex: null,
          stepCount: steps.length,
          fromLocationName: fromLocation?.name,
          toLocationName: toLocation?.name,
        }),
      );
    } else {
      const note = formatJourneyAdvanceNote({
        previousIndex: updated.journeyStepIndex,
        nextIndex: 'journeyStepIndex' in advancePatch ? advancePatch.journeyStepIndex : null,
        stepCount: steps.length,
        fromLocationName: fromLocation?.name,
        toLocationName: toLocation?.name,
      });
      addEvent(
        visitId,
        'routed',
        updated.status,
        after.status,
        updated.targetLocationId,
        after.targetLocationId,
        updated.queueId,
        after.queueId,
        'system',
        note,
      );
    }
    return after;
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
      if (!checkInSurface || checkInSurface.type !== 'terminal') throw new Error('CHECKIN_SURFACE_INVALID');

      const selectedTopic = data.topics.find((item) => item.id === resolvedTopicId && item.active);
      const selectedRule = ruleForTopicAtSurface(data, resolvedTopicId, surfaceId);
      if (!selectedTopic) throw new Error('TOPIC_OR_ROUTING_RULE_MISSING');
      if (!selectedRule) {
        const hasActiveRule = data.routingRules.some((item) => item.topicId === resolvedTopicId && item.active);
        throw new Error(hasActiveRule ? 'TOPIC_NOT_ALLOWED_AT_SURFACE' : 'TOPIC_OR_ROUTING_RULE_MISSING');
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
      const templateSteps = useJourney ? stepsForTemplate(selectedRule.journeyTemplateId!, data.journeySteps) : [];
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
      let checkedInNote = selectedTopic.name;
      let routeNote = selectedRule.name;

      if (useJourney && journeyStep0) {
        const target = data.locations.find((location) => location.id === journeyStep0.targetLocationId);
        const stepPatch = stepToVisitPatch(journeyStep0, { effectiveEscortPolicy: effectivePolicy }, { targetLocation: target });
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
      db.prepare('INSERT INTO patients VALUES (?, ?, ?, ?)').run(patientId, body.displayName || null, body.displayName ? 0 : 1, now);
      maybeFail('checkIn:visit');
      db.prepare(
        'INSERT INTO visits VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
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
        journeyState,
        now,
        now,
      );
      maybeFail('checkIn:visitTopic');
      db.prepare('INSERT INTO visit_topics VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), visitId, selectedTopic.id, 1, 'open');
      maybeFail('checkIn:event:checked_in');
      addEvent(visitId, 'checked_in', null, visitStatus, null, visitLastKnown, null, visitQueue, 'terminal', checkedInNote);
      maybeFail('checkIn:event:routed');
      addEvent(visitId, 'routed', null, visitStatus, null, visitTarget, null, visitQueue, 'system', routeNote);
      return visitById(visitId);
    });

  const transition = (visitId: string, action: TransitionAction, context: TransitionContext = {}): VisitView | undefined =>
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
        const callPatch: Partial<Visit> = {
          status: 'called',
          locationConfidence: 'instructed',
          calledAt: now,
          arrivedAt: undefined,
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
        );
      } else if (action === 'arrive') {
        const data = loadCatalog();
        const nextQueueId = resolveQueueOnArrival(current.queueId, current.targetLocationId, data.queues);
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
        );
      } else if (action === 'done') {
        const donePatch: Partial<Visit> = { status: 'done', finishedAt: now };
        if (current.status === 'arrived' && context.actingLocationId) {
          donePatch.startedAt = current.startedAt ?? current.arrivedAt ?? now;
        }
        maybeFail('transition:update');
        updateVisit(current, donePatch);
        maybeFail('transition:event');
        addEvent(
          visitId,
          'done',
          current.status,
          'done',
          current.lastKnownLocationId,
          current.targetLocationId,
          current.queueId,
          current.queueId,
          'mfa',
        );
      } else if (action === 'return_to_waiting') {
        // Recall, kein Redirect: journeyState bleibt unveraendert (applyJourneyAdvance no-op ohne passendes advanceOn).
        const data = loadCatalog();
        const returnPatch = resolveReturnToWaitingVisitPatch(current, data);
        const nextStatus = returnPatch.status!;
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
        );
      } else {
        throw new Error('UNKNOWN_ACTION');
      }
      return applyJourneyAdvance(visitId, action);
    });

  const redirect = (visitId: string, body: RedirectRequestBody): VisitView | undefined =>
    runInTransaction(db, () => {
      const current = visitById(visitId);
      if (!current) throw new Error('VISIT_NOT_FOUND');
      validateRedirectRequest(loadCatalog(), current, body);
      const data = loadCatalog();
      const targetLocation = data.locations.find((item) => item.id === body.targetLocationId);
      const wasOnJourney = current.journeyStepIndex != null || current.journeyState === 'active';
      const patch = resolveRedirectVisitPatch(current, body, { targetLocation });
      if (wasOnJourney) {
        patch.journeyState = 'abandoned';
      }
      const nextStatus = patch.status!;
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
          body.targetLocationId,
          current.queueId,
          body.queueId,
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
          body.targetLocationId,
          current.queueId,
          body.queueId,
          'mfa',
          body.staffNote,
          { correlationId },
        );
      } else {
        maybeFail('redirect:event');
        addEvent(
          visitId,
          'redirected',
          current.status,
          nextStatus,
          current.targetLocationId,
          body.targetLocationId,
          current.queueId,
          body.queueId,
          'mfa',
          body.staffNote,
        );
      }
      return visitById(visitId);
    });

  return { checkIn, transition, redirect };
}

export type VisitService = ReturnType<typeof createVisitService>;
