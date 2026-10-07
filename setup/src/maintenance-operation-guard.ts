import { assertNoBindingOperation } from './binding-operation.js';
import { assertNoTlsOperation } from './tls-operation.js';
import { ManagerApiError } from '@wartezimmer/server-shared/setup-api';
import { assertNoUpdateOperation } from './update-operation.js';
import { assertNoRestoreOperation } from './restore-operation.js';
import { readInstallOperation } from './install-operation.js';
import { readRestrictedOperation } from './restricted-operation.js';
import { hostMutationLock } from './host-mutation-lock.js';

export function assertNoMaintenanceOperation(home: string, recoveringBinding = false): void {
  if (!recoveringBinding) assertNoBindingOperation(home);
  assertNoTlsOperation(home);
  assertNoUpdateOperation(home);
  assertNoRestoreOperation(home);
}

/** Install completion may explicitly own its nested restore; unrelated journals never yield. */
export function assertMaintenancePredecessors(
  home: string,
  installationId: string | null = null,
): void {
  assertNoBindingOperation(home);
  let blocked: boolean;
  try {
    const install = readInstallOperation(home);
    blocked =
      Boolean(readRestrictedOperation(home)) ||
      (installationId !== null
        ? install?.id !== installationId || install.phase !== 'installing'
        : install !== null);
  } catch {
    throw new ManagerApiError({
      code: 'maintenance_predecessor_unreadable',
      category: 'inconsistent',
      retryable: false,
      message: 'Ein vorhandener Hostvorgang ist nicht lesbar. Bitte die Setup-Diagnose prüfen.',
    });
  }
  if (blocked)
    throw new ManagerApiError({
      code: 'maintenance_predecessor_pending',
      category: 'conflict',
      retryable: true,
      message: 'Ein anderer Hostvorgang muss zuerst geklärt werden.',
    });
}

export function runHostMutation<T>(
  home: string,
  operation: string,
  action: () => Promise<T>,
): Promise<T> {
  return hostMutationLock(home).run(operation, async () => {
    assertNoMaintenanceOperation(home);
    return action();
  });
}
