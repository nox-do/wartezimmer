import { syncDirectory, replaceFile } from './maintenance-files.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const activeOperations = new Set<string>();
export const isRestrictedOperationActive = (id: string) => activeOperations.has(id);
export const releaseRestrictedOperation = (id: string) => {
  activeOperations.delete(id);
};

export const restrictedOperationDir = (home: string) =>
  path.join(home, 'state', 'restricted-operation');
export type RestrictedOperation = {
  version: 1;
  id: string;
  pid: number;
  stackWasRunning: boolean;
  action: 'pending-apply' | 'pending-remove';
  previousEnv: string;
  previousCaddyfile: string | null;
};

export function durableWrite(
  file: string,
  content: string,
  mode = 0o600,
  options: { preserveExistingMode?: boolean } = {},
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let existingMode: number | undefined;
  if (options.preserveExistingMode && process.platform !== 'win32') {
    try {
      existingMode = fs.statSync(file).mode & 0o777;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', existingMode ?? mode);
  try {
    try {
      fs.writeFileSync(fd, content);
      if (existingMode !== undefined) fs.fchmodSync(fd, existingMode);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    replaceFile(temporary, file);
    syncDirectory(path.dirname(file));
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function readRestrictedOperation(home: string): RestrictedOperation | null {
  const directory = restrictedOperationDir(home);
  if (!fs.existsSync(directory)) return null;
  const value = JSON.parse(
    fs.readFileSync(path.join(directory, 'journal.json'), 'utf8'),
  ) as RestrictedOperation;
  if (
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !Number.isInteger(value.pid) ||
    typeof value.stackWasRunning !== 'boolean' ||
    typeof value.previousEnv !== 'string' ||
    !(value.previousCaddyfile === null || typeof value.previousCaddyfile === 'string') ||
    !['pending-apply', 'pending-remove'].includes(value.action)
  )
    throw new Error('Restricted-Journal ungültig; Patientenzugang bleibt gesperrt.');
  return value;
}

export function beginRestrictedOperation(
  home: string,
  enable: boolean,
  stackWasRunning = false,
): RestrictedOperation {
  const directory = restrictedOperationDir(home);
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.mkdirSync(directory); // Exclusive across setup processes; never overwrite another operation.
  syncDirectory(path.dirname(directory));
  const caddyfile = path.join(home, 'state/tls/Caddyfile');
  const operation: RestrictedOperation = {
    version: 1,
    id: randomUUID(),
    pid: process.pid,
    stackWasRunning,
    action: enable ? 'pending-apply' : 'pending-remove',
    previousEnv: fs.readFileSync(path.join(home, '.env'), 'utf8'),
    previousCaddyfile: fs.existsSync(caddyfile) ? fs.readFileSync(caddyfile, 'utf8') : null,
  };
  durableWrite(path.join(directory, 'journal.json'), JSON.stringify(operation));
  durableWrite(path.join(directory, 'compose.yml'), 'services:\n  proxy:\n    restart: "no"\n');
  activeOperations.add(operation.id);
  return operation;
}

export function restrictedOperationEnv(home: string, id?: string): string {
  if (!id) return path.join(home, '.env');
  if (readRestrictedOperation(home)?.id !== id)
    throw new Error('Restricted-Operation stimmt nicht mit dem Journal überein.');
  return path.join(restrictedOperationDir(home), 'candidate.env');
}

export function finishRestrictedOperation(home: string, id: string): void {
  if (readRestrictedOperation(home)?.id !== id)
    throw new Error('Restricted-Journal wurde verändert.');
  // Atomic rename makes completion unambiguous even if cleanup is interrupted.
  const completed = `${restrictedOperationDir(home)}.completed-${id}`;
  replaceFile(restrictedOperationDir(home), completed);
  syncDirectory(path.dirname(completed));
  activeOperations.delete(id);
  try {
    fs.rmSync(completed, { recursive: true, force: true });
  } catch {
    /* committed; leftover backup cleanup must not roll back the operation */
  }
}
