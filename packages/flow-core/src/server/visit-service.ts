import type { DatabaseSync } from 'node:sqlite';
import type {
  Catalog,
  ResolveBusinessDay,
  TransitionAction,
  Visit,
  VisitEvent,
  VisitView,
} from '@praxis-flow/flow-core';
import {
  MFA_ASSIST_TOPIC_ID,
  assertCheckInCombination,
  normalizeCheckInTopicId,
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
import type {
  RedirectRequestBody,
  RedirectContext,
  TransitionRequestBody,
} from '@praxis-flow/flow-core';
import { resolveCheckInRouting } from './escort.js';
import { resolveQueueOnArrival } from './location-routing.js';
import { allocateQueueSequence } from './queue-counter.js';
import type { CatalogRepository } from './catalog-repository.js';
import type { VisitRepository } from './visit-repository.js';
import { runInTransaction } from './unit-of-work.js';
import { supersedeVisit, type SupersedeRequest, type SupersedeResult } from './visit-supersede.js';

export type { SupersedeRequest, SupersedeResult } from './visit-supersede.js';

type CheckInBody = {
  topicId?: string;
  mfaAssist?: boolean;
  authPath?: Visit['authPath'];
  surfaceId?: string;
  displayName?: string;
  needsAssistance?: boolean;
  staffNote?: string;
};

type VisitTransitionContext = TransitionRequestBody & {
  /** Host-injizierte Audit-Identitaet — nicht aus HTTP-Body. */
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
  const { visitRecordById, toVisitView, updateVisit, addEvent, insertCheckInAggregate } =
    visitRepository;

  const visitView = (id: string, catalog: Catalog): VisitView | undefined => {
    const record = visitRecordById(id);
    return record ? toVisitView(record, catalog) : undefined;
  };

  const applyJourneyPatch = (
    visitId: string,
    current: Visit,
    patch: JourneyProgressionPatch,
    steps: ReturnType<typeof stepsForTemplate>,
    catalog: Catalog,
    actorId?: string,
  ): VisitView => {
    maybeFail('journeyProgression:update');
    updateVisit(current, patch);
    const afterRecord = visitRecordById(visitId)!;
    const after = toVisitView(afterRecord, catalog);
    const fromLocation = catalog.locations.find((item) => item.id === current.targetLocationId);
    const toLocation = catalog.locations.find((item) => item.id === afterRecord.targetLocationId);
    maybeFail('journeyProgression:event');
    if ('journeyState' in patch && patch.journeyState === 'completed') {
      addEvent(
        visitId,
        'journey_completed',
        current.status,
        afterRecord.status,
        current.targetLocationId,
        afterRecord.targetLocationId,
        current.queueId,
        afterRecord.queueId,
        'system',
        formatJourneyNextStepNote({
          previousIndex: current.journeyStepIndex!,
          nextIndex: null,
          stepCount: steps.length,
          fromLocationName: fromLocation?.name,
          toLocationName: toLocation?.name,
        }),
        { actorId },
      );
    } else if ('journeyStepIndex' in patch) {
      addEvent(
        visitId,
        'routed',
        current.status,
        afterRecord.status,
        current.targetLocationId,
        afterRecord.targetLocationId,
        current.queueId,
        afterRecord.queueId,
        'system',
        formatJourneyNextStepNote({
          previousIndex: current.journeyStepIndex!,
          nextIndex: patch.journeyStepIndex ?? null,
          stepCount: steps.length,
          fromLocationName: fromLocation?.name,
          toLocationName: toLocation?.name,
        }),
        { actorId },
      );
    } else if ('journeyStepCompletedAt' in patch) {
      addEvent(
        visitId,
        'journey_step_completed',
        current.status,
        afterRecord.status,
        current.targetLocationId,
        afterRecord.targetLocationId,
        current.queueId,
        afterRecord.queueId,
        'system',
        `Journey Schritt ${journeyStepLabel(steps, current.journeyStepIndex) ?? ''} erledigt`.trim(),
        { actorId },
      );
    }
    return after;
  };

  const applyJourneyProgression = (
    visitId: string,
    action: TransitionAction,
    completedAt: string,
    catalog: Catalog,
    actorId?: string,
  ): VisitView | undefined => {
    const record = visitRecordById(visitId);
    if (!record?.journeyTemplateId || record.journeyStepIndex == null) {
      return visitView(visitId, catalog);
    }

    const steps = stepsForTemplate(record.journeyTemplateId, catalog.journeySteps);
    const journeyPatch = completeJourneyStepPatch(record, action, steps, {
      completedAt,
      locations: catalog.locations,
    });
    if (!journeyPatch) return toVisitView(record, catalog);
    return applyJourneyPatch(visitId, record, journeyPatch, steps, catalog, actorId);
  };

  const startNextJourneyStep = (
    visitId: string,
    catalog: Catalog,
    targetLocationId?: string,
    actorId?: string,
  ): VisitView | undefined => {
    const record = visitRecordById(visitId);
    if (
      !record?.journeyTemplateId ||
      record.journeyStepIndex == null ||
      !record.journeyStepCompletedAt
    ) {
      throw new Error('START_NEXT_JOURNEY_STEP_NOT_ALLOWED');
    }
    const steps = stepsForTemplate(record.journeyTemplateId, catalog.journeySteps);
    if (targetLocationId) {
      assertCallTargetLocation(catalog, targetLocationId);
    }
    const journeyPatch = startNextJourneyStepPatch(record, steps, {
      locations: catalog.locations,
      targetLocationId,
      completedAt: new Date().toISOString(),
    });
    if (!journeyPatch || journeyPatch.journeyState === 'completed') {
      throw new Error('START_NEXT_JOURNEY_STEP_NOT_ALLOWED');
    }
    return applyJourneyPatch(visitId, record, journeyPatch, steps, catalog, actorId);
  };

  const checkIn = (body: CheckInBody): VisitView | undefined =>
    runInTransaction(db, () => {
      const data = loadCatalog();
      const mfaAssist = Boolean(body.mfaAssist);
      const needsAssistance = Boolean(body.needsAssistance);
      const topicId = normalizeCheckInTopicId(body.topicId);
      assertCheckInCombination({ topicId, mfaAssist, needsAssistance });
      const resolvedTopicId = mfaAssist ? MFA_ASSIST_TOPIC_ID : topicId!;
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

      const visitNeedsAssistance = mfaAssist || (checkInPath === 'topic' && needsAssistance);
      const configuredEscortPolicy = selectedRule.escortPolicy;
      const effectivePolicy = effectiveEscortPolicy(configuredEscortPolicy, visitNeedsAssistance);
      const allowRedirect = selectedRule.allowRedirect;

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

      // The reserved M topic also serves ordinary walk-in reception check-ins.
      // Only the explicit mfaAssist path starts at the terminal and requires pickup.
      if (mfaAssist) {
        visitLastKnown = checkInSurface.locationId;
        visitMovement = 'pickup';
        visitStatus = 'waiting';
        visitTerminalInstruction =
          'Bitte bleiben Sie am Terminal. Eine Mitarbeiterin oder ein Mitarbeiter holt Sie hier ab.';
      }

      maybeFail('checkIn:patient');
      maybeFail('checkIn:visit');
      insertCheckInAggregate({
        patient: {
          id: patientId,
          displayName: body.displayName || null,
          isAnonymous: !body.displayName,
          createdAt: now,
        },
        visit: {
          id: visitId,
          patientId,
          status: visitStatus,
          primaryTopicId: selectedTopic.id,
          appliedRoutingRuleId: selectedRule.id,
          lastKnownLocationId: visitLastKnown,
          targetLocationId: visitTarget,
          queueId: visitQueue,
          lastSurfaceId: surfaceId,
          movementMode: visitMovement,
          locationConfidence: visitConfidence,
          publicDisplayMode: visitDisplay,
          queueNumber,
          queueNumberDate: businessDay,
          queueNumberScope: queueScope,
          queueLaneCode,
          queueSequence,
          needsAssistance: visitNeedsAssistance,
          checkInPath,
          authPath,
          configuredEscortPolicy,
          effectiveEscortPolicy: effectivePolicy,
          allowRedirect,
          terminalInstruction: visitTerminalInstruction,
          staffNote: body.staffNote ?? null,
          checkedInAt: now,
          journeyTemplateId,
          journeyStepIndex,
          journeyState,
          createdAt: now,
          updatedAt: now,
        },
        topic: {
          id: crypto.randomUUID(),
          visitId,
          topicId: selectedTopic.id,
        },
      });
      maybeFail('checkIn:visitTopic');
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
      const record = visitRecordById(visitId);
      return record ? toVisitView(record, data) : undefined;
    });

  const supersede = (id: string, body: SupersedeRequest): SupersedeResult =>
    supersedeVisit({
      db,
      catalogRepository,
      visitRepository,
      maybeFail,
      resolveBusinessDay,
      visitId: id,
      body,
    });

  const transition = (
    visitId: string,
    action: TransitionAction,
    context: VisitTransitionContext = {},
  ): VisitView | undefined =>
    runInTransaction(db, () => {
      const catalog = loadCatalog();
      const record = visitRecordById(visitId);
      if (!record) throw new Error('VISIT_NOT_FOUND');
      assertTransitionAllowed(record, action, context);
      assertActingLocationScope(record, context.actingLocationId);
      const now = new Date().toISOString();
      if (action === 'start_next_journey_step') {
        return startNextJourneyStep(
          visitId,
          catalog,
          context.targetLocationId ?? undefined,
          context.actorId,
        );
      }
      if (action === 'call') {
        if (context.targetLocationId) {
          assertCallTargetLocation(catalog, context.targetLocationId);
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
        const nextTargetLocationId = callPatch.targetLocationId ?? record.targetLocationId;
        maybeFail('transition:update');
        updateVisit(record, callPatch);
        maybeFail('transition:event');
        addEvent(
          visitId,
          'called',
          record.status,
          'called',
          record.lastKnownLocationId,
          nextTargetLocationId,
          record.queueId,
          record.queueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else if (action === 'arrive') {
        const nextQueueId = resolveQueueOnArrival(
          record.queueId,
          record.targetLocationId,
          catalog.queues,
        );
        const targetLocation = catalog.locations.find(
          (location) => location.id === record.targetLocationId,
        );
        const pickupIntoWaitingArea =
          record.status === 'waiting' &&
          record.movementMode === 'pickup' &&
          record.needsAssistance &&
          targetLocation?.type === 'waiting_area';
        const destinationQueue = catalog.queues.find((queue) => queue.id === nextQueueId);
        const nextStatus = pickupIntoWaitingArea ? 'waiting' : 'arrived';
        const arrivePatch: VisitPatch = {
          status: nextStatus,
          locationConfidence: 'confirmed',
          arrivedAt: pickupIntoWaitingArea ? null : now,
        };
        if (pickupIntoWaitingArea) {
          arrivePatch.movementMode = destinationQueue?.defaultMovementMode ?? 'call';
        }
        // VisitPatch: fehlender Key = preserve; kein explizites undefined (z. B. Raum ohne eigene Queue).
        if (record.targetLocationId !== undefined) {
          arrivePatch.lastKnownLocationId = record.targetLocationId;
        }
        if (nextQueueId !== undefined) {
          arrivePatch.queueId = nextQueueId;
        }
        maybeFail('transition:update');
        updateVisit(record, arrivePatch);
        maybeFail('transition:event');
        addEvent(
          visitId,
          'arrived',
          record.status,
          nextStatus,
          record.lastKnownLocationId,
          record.targetLocationId,
          record.queueId,
          nextQueueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else if (action === 'start') {
        maybeFail('transition:update');
        updateVisit(record, { status: 'in_progress', startedAt: now });
        maybeFail('transition:event');
        addEvent(
          visitId,
          'started',
          record.status,
          'in_progress',
          record.lastKnownLocationId,
          record.targetLocationId,
          record.queueId,
          record.queueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else if (action === 'done') {
        const steps =
          record.journeyTemplateId != null
            ? stepsForTemplate(record.journeyTemplateId, catalog.journeySteps)
            : [];
        const currentStep =
          record.journeyStepIndex != null ? steps[record.journeyStepIndex] : undefined;
        const hasNextJourneyStep =
          record.journeyTemplateId != null &&
          record.journeyStepIndex != null &&
          currentStep?.completedWhen === 'done' &&
          steps[record.journeyStepIndex + 1] != null;
        const donePatch: VisitPatch = hasNextJourneyStep
          ? { status: record.status === 'arrived' ? 'in_progress' : record.status }
          : { status: 'done', finishedAt: now };
        if (record.status === 'arrived' && context.actingLocationId) {
          donePatch.startedAt = record.startedAt ?? record.arrivedAt ?? now;
        }
        const nextStatus = donePatch.status ?? record.status;
        maybeFail('transition:update');
        updateVisit(record, donePatch);
        maybeFail('transition:event');
        addEvent(
          visitId,
          'done',
          record.status,
          nextStatus,
          record.lastKnownLocationId,
          record.targetLocationId,
          record.queueId,
          record.queueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
        const progressed = applyJourneyProgression(visitId, action, now, catalog, context.actorId);
        // Terminal done mid-Journey: abandon (Cancel-Parität). Normales Journey-Ende
        // (completedWhen: done, letzter Hop) setzt vorher journeyState=completed.
        const afterDone = visitRecordById(visitId);
        if (afterDone?.status === 'done' && afterDone.journeyState === 'active') {
          const correlationId = crypto.randomUUID();
          maybeFail('transition:journeyExit');
          updateVisit(afterDone, { journeyState: 'abandoned' });
          addEvent(
            visitId,
            'journey_abandoned',
            'done',
            'done',
            afterDone.targetLocationId,
            afterDone.targetLocationId,
            afterDone.queueId,
            afterDone.queueId,
            'system',
            'wegen Entlassen',
            { correlationId },
          );
          return visitView(visitId, catalog);
        }
        return progressed;
      } else if (action === 'return_to_waiting') {
        const returnPatch = resolveReturnToWaitingVisitPatch(record, catalog);
        const nextStatus = returnPatch.status ?? record.status;
        const nextLastKnown = returnPatch.lastKnownLocationId ?? record.lastKnownLocationId;
        const nextQueueId = returnPatch.queueId ?? record.queueId;
        maybeFail('transition:update');
        updateVisit(record, returnPatch);
        maybeFail('transition:event');
        addEvent(
          visitId,
          'returned_to_waiting',
          record.status,
          nextStatus,
          record.targetLocationId,
          nextLastKnown,
          record.queueId,
          nextQueueId,
          'mfa',
          null,
          { actorId: context.actorId },
        );
      } else {
        throw new Error('UNKNOWN_ACTION');
      }
      return applyJourneyProgression(visitId, action, now, catalog, context.actorId);
    });

  const redirect = (
    visitId: string,
    body: RedirectRequestBody,
    context: RedirectContext = {},
  ): VisitView | undefined =>
    runInTransaction(db, () => {
      const catalog = loadCatalog();
      const record = visitRecordById(visitId);
      if (!record) throw new Error('VISIT_NOT_FOUND');
      validateRedirectRequest(catalog, record, body);
      const effectiveTargetLocationId = effectiveRedirectTargetLocationId(body, record);
      const effectiveQueueId = effectiveRedirectQueueId(body, record);
      const targetLocation = effectiveTargetLocationId
        ? catalog.locations.find((item) => item.id === effectiveTargetLocationId)
        : undefined;
      const wasOnJourney = record.journeyStepIndex != null || record.journeyState === 'active';
      const patch = resolveRedirectVisitPatch(record, body, { targetLocation });
      if (wasOnJourney) {
        patch.journeyState = 'abandoned';
      }
      const nextStatus = patch.status;
      maybeFail('redirect:update');
      updateVisit(record, patch);
      if (wasOnJourney) {
        maybeFail('redirect:journeyExit');
        const correlationId = crypto.randomUUID();
        addEvent(
          visitId,
          'journey_abandoned',
          record.status,
          nextStatus,
          record.targetLocationId,
          effectiveTargetLocationId ?? null,
          record.queueId,
          effectiveQueueId ?? null,
          'system',
          'wegen Redirect',
          { correlationId },
        );
        maybeFail('redirect:event');
        addEvent(
          visitId,
          'redirected',
          record.status,
          nextStatus,
          record.targetLocationId,
          effectiveTargetLocationId ?? null,
          record.queueId,
          effectiveQueueId ?? null,
          'mfa',
          body.staffNote ?? null,
          { correlationId, actorId: context.actorId },
        );
      } else {
        maybeFail('redirect:event');
        addEvent(
          visitId,
          'redirected',
          record.status,
          nextStatus,
          record.targetLocationId,
          effectiveTargetLocationId ?? null,
          record.queueId,
          effectiveQueueId ?? null,
          'mfa',
          body.staffNote ?? null,
          { actorId: context.actorId },
        );
      }
      return visitView(visitId, catalog);
    });

  const cancel = (visitId: string, context: CancelContext = {}): VisitView | undefined =>
    runInTransaction(db, () => {
      const catalog = loadCatalog();
      const record = visitRecordById(visitId);
      if (!record) throw new Error('VISIT_NOT_FOUND');
      if (
        !['waiting', 'directed', 'called', 'arrived', 'in_progress', 'blocked'].includes(
          record.status,
        )
      ) {
        throw new Error('CANCEL_NOT_ALLOWED');
      }

      const now = new Date().toISOString();
      const wasOnJourney = record.journeyState === 'active' || record.journeyStepIndex != null;
      const correlationId = wasOnJourney ? crypto.randomUUID() : undefined;
      maybeFail('cancel:update');
      updateVisit(record, {
        status: 'cancelled',
        finishedAt: now,
        ...(wasOnJourney ? { journeyState: 'abandoned' } : {}),
      });

      if (wasOnJourney) {
        maybeFail('cancel:journeyExit');
        addEvent(
          visitId,
          'journey_abandoned',
          record.status,
          'cancelled',
          record.targetLocationId,
          record.targetLocationId,
          record.queueId,
          record.queueId,
          'system',
          'wegen Abbruch',
          { correlationId },
        );
      }

      maybeFail('cancel:event');
      addEvent(
        visitId,
        'cancelled',
        record.status,
        'cancelled',
        record.targetLocationId,
        record.targetLocationId,
        record.queueId,
        record.queueId,
        context.actorType ?? 'mfa',
        context.note,
        { correlationId, actorId: context.actorId },
      );
      return visitView(visitId, catalog);
    });

  const reassignTarget = (visitId: string, context: ReassignTargetContext): VisitView | undefined =>
    runInTransaction(db, () => {
      const catalog = loadCatalog();
      const record = visitRecordById(visitId);
      if (!record) throw new Error('VISIT_NOT_FOUND');
      const canRetargetPickup = record.status === 'waiting' && record.movementMode === 'pickup';
      const canRetargetDirected = record.status === 'directed' && record.movementMode === 'self_go';
      if (
        !['called', 'arrived', 'in_progress'].includes(record.status) &&
        !canRetargetPickup &&
        !canRetargetDirected
      ) {
        throw new Error('REASSIGN_TARGET_NOT_ALLOWED');
      }

      assertCallTargetLocation(catalog, context.targetLocationId);
      if (record.targetLocationId === context.targetLocationId) {
        return toVisitView(record, catalog);
      }

      const targetLocation = catalog.locations.find((item) => item.id === context.targetLocationId);
      const now = new Date().toISOString();
      const nextStatus =
        record.movementMode === 'call' ? 'called' : statusForMovementMode(record.movementMode);
      maybeFail('reassignTarget:update');
      updateVisit(record, {
        status: nextStatus,
        targetLocationId: context.targetLocationId,
        locationConfidence: 'instructed',
        terminalInstruction: movementTerminalInstruction({
          movementMode: record.movementMode,
          targetLocation,
        }),
        calledAt: record.movementMode === 'call' ? now : null,
        arrivedAt: null,
        startedAt: null,
      });

      maybeFail('reassignTarget:event');
      addEvent(
        visitId,
        'target_reassigned',
        record.status,
        nextStatus,
        record.targetLocationId,
        context.targetLocationId,
        record.queueId,
        record.queueId,
        context.actorType ?? 'mfa',
        context.note,
        { actorId: context.actorId },
      );
      return visitView(visitId, catalog);
    });

  return { checkIn, supersede, transition, redirect, cancel, reassignTarget };
}

export type VisitService = ReturnType<typeof createVisitService>;
