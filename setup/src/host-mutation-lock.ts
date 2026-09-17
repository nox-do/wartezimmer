import { SetupApiValidationError } from './setup-api-normalize.js';

export type HostMutationLock = {
  run<T>(operation: string, action: () => Promise<T>): Promise<T>;
};

/** Process-local exclusion for host mutations; reads remain available. */
export function createHostMutationLock(): HostMutationLock {
  let activeOperation: string | null = null;
  return {
    async run<T>(operation: string, action: () => Promise<T>): Promise<T> {
      if (activeOperation) {
        throw new SetupApiValidationError(
          `Eine andere Hoständerung läuft bereits (${activeOperation}). Bitte warten und den Status erneut prüfen.`,
        );
      }
      activeOperation = operation;
      try {
        return await action();
      } finally {
        activeOperation = null;
      }
    },
  };
}
