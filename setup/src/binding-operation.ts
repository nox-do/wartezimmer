import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createOperationJournal } from './operation-journal.js';

export type BindingOperation = {
  schemaVersion: 1;
  id: string;
  phase: 'prepared' | 'cutover' | 'recovery-failed' | 'committed' | 'recovered';
  previousEnv: string | null;
  stackWasRunning: boolean;
  runtimeChanged: boolean;
  delivery: boolean;
};

function validate(value: unknown): BindingOperation {
  const op = value as BindingOperation | null;
  if (
    !op ||
    op.schemaVersion !== 1 ||
    typeof op.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(op.id) ||
    !['prepared', 'cutover', 'recovery-failed', 'committed', 'recovered'].includes(op.phase) ||
    !(op.previousEnv === null || typeof op.previousEnv === 'string') ||
    typeof op.runtimeChanged !== 'boolean' ||
    typeof op.stackWasRunning !== 'boolean' ||
    typeof op.delivery !== 'boolean'
  )
    throw new Error('BINDING_JOURNAL_INVALID');
  return op;
}

export const {
  read: readBindingOperation,
  write: writeBindingOperation,
  status: readBindingOperationStatus,
  assertNone: assertNoBindingOperation,
  finish: finishBindingOperation,
} = createOperationJournal('binding', 'Netzwerk', validate);

export function beginBindingOperation(
  home: string,
  stackWasRunning: boolean,
  delivery: boolean,
): BindingOperation {
  assertNoBindingOperation(home);
  const envPath = path.join(home, '.env');
  const op: BindingOperation = {
    schemaVersion: 1,
    id: randomUUID(),
    phase: 'prepared',
    stackWasRunning,
    delivery,
    runtimeChanged: false,
    previousEnv: fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null,
  };
  writeBindingOperation(home, op);
  return op;
}
