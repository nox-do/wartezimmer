import {
  createOperationJournal,
  validRecoveryHeader,
  type RecoveryPhase,
} from './operation-journal.js';
import path from 'node:path';
export { syncMaintenanceArtifacts as syncUpdateArtifacts } from './maintenance-files.js';

export type UpdateOperation = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  targetVersion: string;
  utilityImage: string;
} & RecoveryPhase;

export const updateRollbackDirectory = (home: string, id: string) =>
  path.join(home, 'rollback/update', id);
export const updateStagingDirectory = (home: string, id: string) =>
  path.join(home, 'updates/staging', id);

function validate(value: unknown): UpdateOperation {
  const op = value as UpdateOperation | null;
  if (
    !op ||
    !validRecoveryHeader(op) ||
    typeof op.targetVersion !== 'string' ||
    !op.targetVersion.trim() ||
    typeof op.utilityImage !== 'string' ||
    !op.utilityImage.trim()
  ) {
    throw new Error('UPDATE_JOURNAL_INVALID');
  }
  return op;
}

export const {
  path: updateOperationPath,
  read: readUpdateOperation,
  write: writeUpdateOperation,
  status: readUpdateOperationStatus,
  assertNone: assertNoUpdateOperation,
  finish: finishUpdateOperation,
} = createOperationJournal('update', 'Update', validate, (home, id) => [
  updateRollbackDirectory(home, id),
  updateStagingDirectory(home, id),
]);

export { needsRollback as updateNeedsRollback } from './operation-journal.js';
