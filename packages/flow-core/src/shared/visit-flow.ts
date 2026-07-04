import type {
  ActiveVisitStatus,
  MovementMode,
  OpenVisitStatus,
  TerminalVisitStatus,
  Visit,
  VisitStatus,
} from './types.js';
import type { TransitionAction } from './domain-enums.js';

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
export const OPEN_VISIT_STATUSES = new Set<OpenVisitStatus>([
  ...ACTIVE_VISIT_STATUSES,
  'blocked',
]);

export function statusForMovementMode(movementMode: MovementMode): VisitStatus {
  if (movementMode === 'self_go') return 'directed';
  return 'waiting';
}

export type TransitionContext = { actingLocationId?: string };

export function assertTransitionAllowed(
  visit: Visit,
  action: TransitionAction,
  context: TransitionContext = {},
): void {
  switch (action) {
    case 'call':
      if (!['waiting', 'directed'].includes(visit.status)) throw new Error('CALL_ONLY_FROM_WAITING');
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
    default:
      throw new Error('UNKNOWN_ACTION');
  }
}

export function canTransition(visit: Visit, action: TransitionAction, context: TransitionContext = {}): boolean {
  try {
    assertTransitionAllowed(visit, action, context);
    return true;
  } catch {
    return false;
  }
}
