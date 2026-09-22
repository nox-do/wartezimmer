import type {
  ActiveVisitStatus,
  Catalog,
  MovementMode,
  OpenVisitStatus,
  RoutingRule,
  TerminalVisitStatus,
  Visit,
  VisitPatch,
  VisitStatus,
} from './types.js';
import type { TransitionAction } from './domain-enums.js';
import { movementTerminalInstruction } from './escort.js';
import { stepsForJourneyTemplate } from './visit-context.js';

/** Operativ steuerbar — Dashboard, Arbeitslisten, Surface-Filter. */
export const ACTIVE_VISIT_STATUSES = new Set<ActiveVisitStatus>([
  'waiting',
  'directed',
  'called',
  'arrived',
  'in_progress',
]);

/** Fachlich abgeschlossen — negative Open-Filter (Journey-Lock, Tagesbenutzung). */
export const TERMINAL_VISIT_STATUSES = new Set<TerminalVisitStatus>([
  'done',
  'cancelled',
  'no_show',
]);

/** Nicht terminal — blockiert ggf. Tageskonfiguration; ACTIVE + blocked. */
export const OPEN_VISIT_STATUSES = new Set<OpenVisitStatus>([...ACTIVE_VISIT_STATUSES, 'blocked']);

export function isOpenVisitStatus(status: VisitStatus): status is OpenVisitStatus {
  return OPEN_VISIT_STATUSES.has(status as OpenVisitStatus);
}

export function statusForMovementMode(movementMode: MovementMode): VisitStatus {
  if (movementMode === 'self_go') return 'directed';
  return 'waiting';
}

export type TransitionContext = {
  actingLocationId?: string;
  /** Host-injizierte Audit-Identitaet — nicht aus HTTP-Body. */
  actorId?: string;
};

export function assertTransitionAllowed(
  visit: Visit,
  action: TransitionAction,
  context: TransitionContext = {},
): void {
  if (TERMINAL_VISIT_STATUSES.has(visit.status as TerminalVisitStatus)) {
    throw new Error('VISIT_TERMINAL');
  }
  switch (action) {
    case 'call':
      if (!['waiting', 'directed'].includes(visit.status))
        throw new Error('CALL_ONLY_FROM_WAITING');
      if (visit.movementMode !== 'call') throw new Error('CALL_ONLY_FOR_CALL_MOVEMENT');
      return;
    case 'arrive':
      if (visit.movementMode === 'call') {
        if (visit.status !== 'called') throw new Error('ARRIVE_ONLY_WHEN_CALLED');
        return;
      }
      if (visit.movementMode === 'self_go') {
        if (visit.status !== 'directed') throw new Error('ARRIVE_ONLY_WHEN_DIRECTED');
        return;
      }
      if (visit.movementMode === 'pickup') {
        if (visit.status !== 'waiting') throw new Error('ARRIVE_ONLY_WHEN_WAITING');
        return;
      }
      throw new Error('ARRIVE_NOT_ALLOWED');
    case 'start':
      if (visit.status !== 'arrived') throw new Error('START_ONLY_WHEN_ARRIVED');
      return;
    case 'done':
      if (visit.status === 'in_progress') return;
      if (context.actingLocationId && visit.status === 'arrived') return;
      throw new Error('DONE_ONLY_WHEN_IN_PROGRESS');
    case 'return_to_waiting':
      if (
        !['called', 'arrived', 'in_progress'].includes(visit.status) &&
        !(visit.status === 'directed' && visit.movementMode === 'self_go') &&
        !(visit.status === 'waiting' && visit.movementMode === 'pickup')
      ) {
        throw new Error('RETURN_TO_WAITING_NOT_ALLOWED');
      }
      return;
    case 'start_next_journey_step':
      if (
        visit.journeyTemplateId == null ||
        visit.journeyStepIndex == null ||
        !visit.journeyStepCompletedAt ||
        visit.journeyState !== 'active'
      ) {
        throw new Error('START_NEXT_JOURNEY_STEP_NOT_ALLOWED');
      }
      return;
    default:
      throw new Error('UNKNOWN_ACTION');
  }
}

export function canTransition(
  visit: Visit,
  action: TransitionAction,
  context: TransitionContext = {},
): boolean {
  try {
    assertTransitionAllowed(visit, action, context);
    return true;
  } catch {
    return false;
  }
}

/**
 * Aufrufziel nach return_to_waiting: Das operative Visit-Ziel bleibt erhalten.
 * Journey-Step und Rule dienen nur als Fallback, wenn der Snapshot kein Ziel enthält.
 */
export function resolveReturnToWaitingTargetLocationId(
  visit: Visit,
  rule: RoutingRule | undefined,
  catalog: Catalog,
): string | undefined {
  if (visit.journeyTemplateId != null && visit.journeyStepIndex != null) {
    const steps = stepsForJourneyTemplate(visit.journeyTemplateId, catalog.journeySteps);
    const step = steps[visit.journeyStepIndex];
    return visit.targetLocationId ?? step?.targetLocationId ?? rule?.initialTargetLocationId;
  }

  return visit.targetLocationId ?? rule?.initialTargetLocationId;
}

/**
 * Patch fuer return_to_waiting: Warteliste + Wartebereich aus RoutingRule, Aufruf-Timestamps geloescht.
 * Bewusst kein Redirect — Journey bleibt active (Patient verlaesst nur den Aufruf-Zyklus, nicht die Route).
 */
export function resolveReturnToWaitingVisitPatch(visit: Visit, catalog: Catalog): VisitPatch {
  const rule = catalog.routingRules.find((item) => item.id === visit.appliedRoutingRuleId);
  const waitingQueueId = rule?.initialQueueId ?? visit.queueId;
  const waitingQueue = catalog.queues.find((item) => item.id === waitingQueueId);
  const waitingQueueLocationId =
    waitingQueue?.homeLocationId &&
    catalog.locations.find((item) => item.id === waitingQueue.homeLocationId)?.type ===
      'waiting_area'
      ? waitingQueue.homeLocationId
      : undefined;
  // "Zurueck ins Wartezimmer" is a physical staff action. Prefer the queue's
  // waiting area over the rule's original check-in location (for M that is the
  // entrance), otherwise a returned assistance ticket looks like a new terminal call.
  const waitingLocationId = waitingQueueLocationId ?? rule?.initialLastKnownLocationId;
  const queueMovementMode =
    waitingQueue?.defaultMovementMode === 'self_go'
      ? 'call'
      : (waitingQueue?.defaultMovementMode ?? 'call');
  // A conscious return cancels a self-directed route. Call/pickup already encode
  // the correct next interaction and must survive (especially needs_assistance).
  const movementMode = visit.movementMode === 'self_go' ? queueMovementMode : visit.movementMode;
  const targetLocationId = resolveReturnToWaitingTargetLocationId(visit, rule, catalog);
  const targetLocation = catalog.locations.find((item) => item.id === targetLocationId);

  const patch: VisitPatch = {
    status: statusForMovementMode(movementMode),
    movementMode,
    locationConfidence: 'assumed',
    terminalInstruction: movementTerminalInstruction({ movementMode, targetLocation }),
    calledAt: null,
    arrivedAt: null,
    startedAt: null,
  };

  if (targetLocationId !== undefined) {
    patch.targetLocationId = targetLocationId;
  }
  if (waitingQueueId !== undefined) {
    patch.queueId = waitingQueueId;
  }
  patch.lastKnownLocationId = waitingLocationId ?? null;

  return patch;
}
