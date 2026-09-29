import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';

export type HostMutationLock = {
  assertAvailable(): void;
  run<T>(operation: string, action: () => Promise<T>): Promise<T>;
};

/** Process-local exclusion for host mutations; reads remain available. */
export function createHostMutationLock(reentrant = false): HostMutationLock {
  let activeOperation: string | null = null;
  let owner: object | null = null;
  const context = new AsyncLocalStorage<object>();
  function assertAvailable(): void {
    if (activeOperation && context.getStore() !== owner) {
      throw new ManagerApiError({
        code: 'host_mutation_conflict',
        category: 'conflict',
        retryable: true,
        message:
          'Eine andere Hoständerung läuft bereits. Bitte warten und den Status erneut prüfen.',
      });
    }
  }
  return {
    assertAvailable,
    async run<T>(operation: string, action: () => Promise<T>): Promise<T> {
      if (reentrant && owner && context.getStore() === owner) return action();
      if (activeOperation) {
        throw new ManagerApiError({
          code: 'host_mutation_conflict',
          category: 'conflict',
          retryable: true,
          message: `Eine andere Hoständerung läuft bereits (${activeOperation}). Bitte warten und den Status erneut prüfen.`,
        });
      }
      activeOperation = operation;
      owner = {};
      try {
        return await context.run(owner, action);
      } finally {
        activeOperation = null;
        owner = null;
      }
    },
  };
}

// One exclusion domain per host for HTTP, direct callers and startup recovery.
const hostLocks = new Map<string, HostMutationLock>();
export function hostMutationLock(home: string): HostMutationLock {
  const key = path.resolve(home);
  let lock = hostLocks.get(key);
  if (!lock) {
    lock = createHostMutationLock(true);
    hostLocks.set(key, lock);
  }
  return lock;
}
