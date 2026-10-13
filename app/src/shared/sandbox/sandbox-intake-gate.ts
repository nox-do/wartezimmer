import { domainError } from '../errors/domain-error.js';

let intakePaused = false;
const pausedVisits = new Set<string>();
const visitOperations = new Map<string, number>();
const visitDrainWaiters = new Map<string, Array<() => void>>();
let activeIntakeOperations = 0;
let drainWaiters: Array<() => void> = [];

function notifyDrained(): void {
  if (activeIntakeOperations !== 0) {
    return;
  }
  const waiters = drainWaiters;
  drainWaiters = [];
  for (const resolve of waiters) {
    resolve();
  }
}

function waitForIntakeToDrain(): Promise<void> {
  if (activeIntakeOperations === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    drainWaiters.push(resolve);
  });
}

/** Prevents a day reset from racing with uploads, form generation, previews, exports or deletion. */
export async function withSandboxIntakeOperation<T>(
  operation: () => Promise<T>,
  isPersistentlyBlocked: () => boolean = () => false,
  visitId?: string,
): Promise<T> {
  if (intakePaused || isPersistentlyBlocked() || (visitId && pausedVisits.has(visitId))) {
    throw domainError('CHECKIN_LOCKED');
  }

  activeIntakeOperations += 1;
  if (visitId) visitOperations.set(visitId, (visitOperations.get(visitId) ?? 0) + 1);
  try {
    return await operation();
  } finally {
    activeIntakeOperations -= 1;
    if (visitId) {
      const remaining = (visitOperations.get(visitId) ?? 1) - 1;
      if (remaining) visitOperations.set(visitId, remaining);
      else {
        visitOperations.delete(visitId);
        const waiters = visitDrainWaiters.get(visitId) ?? [];
        visitDrainWaiters.delete(visitId);
        waiters.forEach((resolve) => resolve());
      }
    }
    notifyDrained();
  }
}

/** Closes intake, drains active work, and keeps it closed for the complete reset operation. */
export async function withSandboxIntakePaused<T>(operation: () => Promise<T>): Promise<T> {
  if (intakePaused) {
    throw domainError('DAY_CLOSE_IN_PROGRESS');
  }

  intakePaused = true;
  try {
    await waitForIntakeToDrain();
    return await operation();
  } finally {
    intakePaused = false;
  }
}

export function resetSandboxIntakeGateForTests(): void {
  intakePaused = false;
  pausedVisits.clear();
  visitOperations.clear();
  visitDrainWaiters.clear();
  activeIntakeOperations = 0;
  notifyDrained();
}

/** Drain only this visit; count discharge itself so a global reset waits for it. */
export async function withVisitDocumentWorkPaused<T>(
  visitId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (intakePaused || pausedVisits.has(visitId)) throw domainError('CHECKIN_LOCKED');
  pausedVisits.add(visitId);
  activeIntakeOperations += 1;
  try {
    if ((visitOperations.get(visitId) ?? 0) > 0) {
      await new Promise<void>((resolve) => {
        visitDrainWaiters.set(visitId, [...(visitDrainWaiters.get(visitId) ?? []), resolve]);
      });
    }
    return await operation();
  } finally {
    pausedVisits.delete(visitId);
    activeIntakeOperations -= 1;
    notifyDrained();
  }
}
