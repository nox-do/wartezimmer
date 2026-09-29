import fs from 'node:fs';
import path from 'node:path';
import { ManagerApiError, type HostOperationStatus } from '@praxis-flow/server-shared/setup-api';
import { syncParents } from './maintenance-files.js';
import { durableWrite } from './restricted-operation.js';

export type RecoveryPhase =
  | {
      phase: 'prepared' | 'rollback-ready' | 'cutover' | 'rolling-back' | 'committed' | 'recovered';
    }
  | { phase: 'recovery-failed'; recovery: 'restart' | 'rollback' };

export function validRecoveryPhase(op: RecoveryPhase): boolean {
  return (
    [
      'prepared',
      'rollback-ready',
      'cutover',
      'rolling-back',
      'committed',
      'recovered',
      'recovery-failed',
    ].includes(op.phase) &&
    (op.phase === 'recovery-failed'
      ? ['restart', 'rollback'].includes(op.recovery)
      : !('recovery' in op))
  );
}

export function needsRollback(op: RecoveryPhase | null): boolean {
  return (
    op?.phase === 'cutover' ||
    op?.phase === 'rolling-back' ||
    (op?.phase === 'recovery-failed' && op.recovery === 'rollback')
  );
}

export function atPhase<T extends RecoveryPhase>(
  op: T,
  phase: Exclude<RecoveryPhase['phase'], 'recovery-failed'>,
) {
  const next = { ...op, phase };
  if ('recovery' in next) delete next.recovery;
  return next;
}

export function validRecoveryHeader(
  op: { schemaVersion: number; id: string; createdAt: string } & RecoveryPhase,
): boolean {
  return (
    op.schemaVersion === 1 &&
    typeof op.id === 'string' &&
    /^[a-zA-Z0-9-]{16,80}$/.test(op.id) &&
    typeof op.createdAt === 'string' &&
    Number.isFinite(Date.parse(op.createdAt)) &&
    validRecoveryPhase(op)
  );
}

/** Shared file lifecycle; payload validation and recovery stay with each operation. */
export function createOperationJournal<T extends { id: string; phase: string }>(
  kind: string,
  label: string,
  validate: (value: unknown) => T,
  artifacts: (home: string, id: string) => string[] = () => [],
) {
  const file = (home: string) => path.join(home, 'operations', kind, 'journal.json');
  const read = (home: string) => readJournal(file(home), validate);
  const status = (home: string) => operationStatus(() => read(home));
  return {
    path: file,
    read,
    status,
    write(home: string, op: T): void {
      durableWrite(file(home), `${JSON.stringify(validate(op))}\n`);
      syncParents(path.dirname(file(home)), home);
    },
    assertNone(home: string): void {
      const current = status(home);
      if (!current) return;
      const pending = current.kind === 'pending';
      throw new ManagerApiError({
        code: `${kind}_operation_${pending ? 'pending' : 'inconsistent'}`,
        category: pending ? 'conflict' : 'inconsistent',
        retryable: pending,
        message: pending
          ? `Ein ${label}-Vorgang ist noch offen. Bitte warten und den Status erneut prüfen.`
          : `${label}-Recovery ungeklärt. Bitte die Setup-Diagnose prüfen.`,
      });
    },
    finish(home: string, op: T): void {
      finishJournal(home, file(home), op, read(home), artifacts(home, op.id));
    },
  };
}

function readJournal<T>(file: string, validate: (value: unknown) => T): T | null {
  try {
    return validate(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function operationStatus(
  read: () => { id: string; phase: string } | null,
): HostOperationStatus | null {
  try {
    const op = read();
    return op
      ? {
          kind: op.phase === 'recovery-failed' ? 'recovery-failed' : 'pending',
          id: op.id,
          phase: op.phase,
        }
      : null;
  } catch {
    return { kind: 'unreadable' };
  }
}

/** Only a matching durable terminal decision authorizes deleting recovery evidence. */
function finishJournal(
  home: string,
  file: string,
  operation: { id: string; phase: string },
  stored: { id: string; phase: string } | null,
  artifacts: string[],
): void {
  if (
    !stored ||
    stored.id !== operation.id ||
    stored.phase !== operation.phase ||
    !['committed', 'recovered'].includes(stored.phase)
  )
    throw new Error('OPERATION_NOT_COMPLETED');
  for (const artifact of artifacts) {
    fs.rmSync(artifact, { recursive: true, force: true });
    if (fs.existsSync(path.dirname(artifact))) syncParents(path.dirname(artifact), home);
  }
  fs.unlinkSync(file);
  syncParents(path.dirname(file), home);
}
