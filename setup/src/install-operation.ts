import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { InstallOperationSummary } from '@praxis-flow/server-shared';
import { durableWrite } from './restricted-operation.js';

export type InstallMode = 'fresh' | 'replace';
export type InstallOperationPhase = 'prepared' | 'installing';

export type InstallOperation = {
  schemaVersion: 1;
  id: string;
  mode: InstallMode;
  phase: InstallOperationPhase;
  createdAt: string;
  package: {
    sha256: string;
    releaseVersion: string;
  };
  backup: null | {
    fileName: string;
    sha256: string;
    containsTls: boolean;
  };
};

const OPERATIONS_RELATIVE_PATH = path.join('operations', 'install');
const ACTIVE_MARKER_FILE = 'operation.json';
export const PINNED_RELEASE_FILE = 'release.pfinstall';

export function installOperationsRoot(home: string): string {
  return path.join(home, OPERATIONS_RELATIVE_PATH);
}

export function installOperationMarkerPath(home: string): string {
  return path.join(installOperationsRoot(home), ACTIVE_MARKER_FILE);
}

export function installOperationDirectory(home: string, id: string): string {
  return path.join(installOperationsRoot(home), id);
}

export function pinnedReleasePath(home: string, id: string): string {
  return path.join(installOperationDirectory(home, id), PINNED_RELEASE_FILE);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function validateOperation(value: unknown): InstallOperation {
  if (!value || typeof value !== 'object') throw new Error('INSTALL_OPERATION_INVALID');
  const operation = value as Partial<InstallOperation>;
  if (
    operation.schemaVersion !== 1 ||
    typeof operation.id !== 'string' ||
    !/^[a-f0-9-]{16,64}$/i.test(operation.id) ||
    !['fresh', 'replace'].includes(operation.mode ?? '') ||
    !['prepared', 'installing'].includes(operation.phase ?? '') ||
    typeof operation.createdAt !== 'string' ||
    !operation.package ||
    !isSha256(operation.package.sha256) ||
    typeof operation.package.releaseVersion !== 'string' ||
    !operation.package.releaseVersion.trim() ||
    (operation.backup !== null &&
      (!operation.backup ||
        typeof operation.backup.fileName !== 'string' ||
        path.basename(operation.backup.fileName) !== operation.backup.fileName ||
        !isSha256(operation.backup.sha256) ||
        typeof operation.backup.containsTls !== 'boolean'))
  ) {
    throw new Error('INSTALL_OPERATION_INVALID');
  }
  return operation as InstallOperation;
}

export function readInstallOperation(home: string): InstallOperation | null {
  const marker = installOperationMarkerPath(home);
  if (!fs.existsSync(marker)) return null;
  return validateOperation(JSON.parse(fs.readFileSync(marker, 'utf8')) as unknown);
}

export function installOperationSummary(operation: InstallOperation): InstallOperationSummary {
  return {
    id: operation.id,
    mode: operation.mode,
    phase: operation.phase,
    createdAt: operation.createdAt,
    releaseVersion: operation.package.releaseVersion,
    backupContainsTls: operation.backup?.containsTls ?? null,
  };
}

export function createPreparedInstallOperation(input: {
  home: string;
  mode: InstallMode;
  sha256: string;
  releaseVersion: string;
  id?: string;
  createdAt?: string;
}): InstallOperation {
  if (readInstallOperation(input.home)) throw new Error('INSTALL_OPERATION_ALREADY_ACTIVE');
  const operation: InstallOperation = {
    schemaVersion: 1,
    id: input.id ?? randomUUID(),
    mode: input.mode,
    phase: 'prepared',
    createdAt: input.createdAt ?? new Date().toISOString(),
    package: {
      sha256: input.sha256.toLowerCase(),
      releaseVersion: input.releaseVersion,
    },
    backup: null,
  };
  fs.mkdirSync(installOperationDirectory(input.home, operation.id), {
    recursive: true,
  });
  durableWrite(
    installOperationMarkerPath(input.home),
    `${JSON.stringify(operation, null, 2)}\n`,
    0o666,
  );
  return operation;
}

export function markInstallOperationInstalling(home: string, id: string): InstallOperation {
  const operation = readInstallOperation(home);
  if (!operation || operation.id !== id) throw new Error('INSTALL_OPERATION_NOT_FOUND');
  if (operation.phase === 'installing') return operation;
  const next: InstallOperation = { ...operation, phase: 'installing' };
  durableWrite(installOperationMarkerPath(home), `${JSON.stringify(next, null, 2)}\n`, 0o666);
  return next;
}

export function abortPreparedInstallOperation(home: string, id: string): void {
  const operation = readInstallOperation(home);
  if (!operation || operation.id !== id) throw new Error('INSTALL_OPERATION_NOT_FOUND');
  if (operation.phase !== 'prepared') throw new Error('INSTALL_OPERATION_ALREADY_INSTALLING');
  fs.unlinkSync(installOperationMarkerPath(home));
  fs.rmSync(installOperationDirectory(home, id), { recursive: true, force: true });
}

export function removeInstallOperation(home: string, id: string): void {
  const operation = readInstallOperation(home);
  if (!operation || operation.id !== id) throw new Error('INSTALL_OPERATION_NOT_FOUND');
  fs.unlinkSync(installOperationMarkerPath(home));
  fs.rmSync(installOperationDirectory(home, id), { recursive: true, force: true });
}

export function attachInstallBackup(
  home: string,
  id: string,
  backup: NonNullable<InstallOperation['backup']>,
): InstallOperation {
  const operation = readInstallOperation(home);
  if (!operation || operation.id !== id || operation.phase !== 'prepared')
    throw new Error('INSTALL_OPERATION_NOT_PREPARED');
  const next = validateOperation({ ...operation, backup });
  durableWrite(installOperationMarkerPath(home), `${JSON.stringify(next, null, 2)}\n`, 0o666);
  return next;
}
