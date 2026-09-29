import {
  createOperationJournal,
  validRecoveryHeader,
  type RecoveryPhase,
} from './operation-journal.js';
import path from 'node:path';

export type RestoreOperation = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  utilityImage: string | null;
  installationId: string | null;
} & RecoveryPhase;

export const restoreRollbackDirectory = (home: string, id: string) =>
  path.join(home, 'rollback/restore', id);

function validate(value: unknown): RestoreOperation {
  const op = value as RestoreOperation | null;
  if (
    !op ||
    !validRecoveryHeader(op) ||
    !(
      op.utilityImage === null ||
      (typeof op.utilityImage === 'string' && op.utilityImage.trim())
    ) ||
    !(
      op.installationId === null ||
      (typeof op.installationId === 'string' && /^[a-f0-9-]{16,64}$/i.test(op.installationId))
    )
  ) {
    throw new Error('RESTORE_JOURNAL_INVALID');
  }
  return op;
}

export const {
  path: restoreOperationPath,
  read: readRestoreOperation,
  write: writeRestoreOperation,
  status: readRestoreOperationStatus,
  assertNone: assertNoRestoreOperation,
  finish: finishRestoreOperation,
} = createOperationJournal('restore', 'Restore', validate, (home, id) => [
  restoreRollbackDirectory(home, id),
]);

export { needsRollback as restoreNeedsRollback } from './operation-journal.js';
