import { domainError } from '../errors/domain-error.js';

let intakePaused = false;
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

/** Prevents a day reset from racing with uploads or generated form documents. */
export async function withSandboxIntakeOperation<T>(
  operation: () => Promise<T>,
  isPersistentlyBlocked: () => boolean = () => false,
): Promise<T> {
  if (intakePaused || isPersistentlyBlocked()) {
    throw domainError('CHECKIN_LOCKED');
  }

  activeIntakeOperations += 1;
  try {
    return await operation();
  } finally {
    activeIntakeOperations -= 1;
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
  activeIntakeOperations = 0;
  notifyDrained();
}
