import { replaceFile } from './maintenance-files.js';
import { runHostMutation } from './maintenance-operation-guard.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildPfbackupArchive,
  buildPfbackupFilename,
  envRecordForSettingsExport,
  formatPfbackupLabel,
  parsePfbackupTimestampFromPath,
  serializePfbackupArchive,
  validatePfbackupArchive,
  type ManagerState,
  type PfbackupArchiveValidationResult,
} from '@wartezimmer/server-shared';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';
import { readEnvMap } from './env-file.js';
import { readManagerStateForBackup } from './manager-state.js';
import type { SetupContext } from './setup-context.js';
import { packTlsSidecarArchive } from './tls-backup-sidecar.js';
import { MaintenanceClientError, requestMaintenanceJson } from './maintenance-client.js';

const DEFAULT_LOCAL_APP = LOCAL_MAINTENANCE_APP_BASE_URL;

/** DB-only payload from the app — host `.env` is merged by Setup. */
export type SettingsSnapshotDbFromApp = {
  settingsFormatVersion: number;
  exportedAt: string;
  opsSettings: unknown;
  authSettings: unknown;
  messagingProviderConfigs: unknown;
};

export type SettingsSnapshotForBackup = SettingsSnapshotDbFromApp & {
  env: Record<string, string>;
};

function backupsDirectory(installHome: string): string {
  return path.join(installHome, 'backups');
}

function isArchiveValid(content: string): boolean {
  try {
    return validatePfbackupArchive(JSON.parse(content)).archiveValid;
  } catch {
    return false;
  }
}

export function findLatestPfbackupPath(installHome: string): string | null {
  const dir = backupsDirectory(installHome);
  if (!fs.existsSync(dir)) {
    return null;
  }

  const backups = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('wartezimmer-backup-') && name.endsWith('.pfbackup'))
    .map((name) => path.join(dir, name))
    .filter((fullPath) => fs.statSync(fullPath).isFile())
    .sort((left, right) => {
      const leftDate = parsePfbackupTimestampFromPath(left)?.getTime() ?? 0;
      const rightDate = parsePfbackupTimestampFromPath(right)?.getTime() ?? 0;
      return rightDate - leftDate;
    });

  for (const fullPath of backups) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (isArchiveValid(content)) {
      return fullPath;
    }
  }

  return null;
}

export async function fetchSettingsDbSnapshotFromApp(
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<SettingsSnapshotDbFromApp> {
  const body = await requestMaintenanceJson('/api/v1/ops/settings/snapshot', localAppBaseUrl);

  if (typeof body.settingsFormatVersion !== 'number') {
    throw new Error('Ungültige Settings-Snapshot-Antwort der App.');
  }

  return body as SettingsSnapshotDbFromApp;
}

function hostEnvRecord(envPath: string): Record<string, string> {
  const map = readEnvMap(envPath);
  return envRecordForSettingsExport(Object.fromEntries(map.entries()));
}

/** Align manager-state release metadata with stack image keys from host `.env`. */
export function enrichManagerStateForStackBackup(
  managerState: ManagerState,
  env: Record<string, string>,
): ManagerState {
  if (!managerState.release) {
    return managerState;
  }

  const gatewayFromEnv = env.WARTEZIMMER_GATEWAY_IMAGE?.trim();
  if (!gatewayFromEnv || managerState.release.gatewayImage) {
    return managerState;
  }

  return {
    release: {
      ...managerState.release,
      gatewayImage: gatewayFromEnv,
    },
  };
}

export function buildFullSettingsSnapshot(
  dbSnapshot: SettingsSnapshotDbFromApp,
  envPath: string,
): SettingsSnapshotForBackup {
  return {
    ...dbSnapshot,
    env: hostEnvRecord(envPath),
  };
}

export async function validateSettingsSnapshotWithApp(
  snapshot: unknown,
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<{ ok: boolean; errors: string[]; code?: string }> {
  try {
    const body = (await requestMaintenanceJson(
      '/api/v1/ops/settings/snapshot/validate',
      localAppBaseUrl,
      { method: 'POST', body: snapshot },
    )) as {
      ok?: boolean;
      errors?: string[];
      code?: string;
      message?: string;
    };

    return {
      ok: body.ok === true,
      errors: Array.isArray(body.errors) ? body.errors : [],
      code: typeof body.code === 'string' ? body.code : undefined,
    };
  } catch (error) {
    const responseBody = error instanceof MaintenanceClientError ? error.responseBody : undefined;
    const responseErrors = responseBody?.errors;
    return {
      ok: false,
      errors: [
        ...(Array.isArray(responseErrors)
          ? responseErrors.filter((entry): entry is string => typeof entry === 'string')
          : [error instanceof Error ? error.message : 'Restore-Validierung nicht möglich.']),
      ],
      code: typeof responseBody?.code === 'string' ? responseBody.code : undefined,
    };
  }
}

export type SettingsSnapshotImportViaAppReport = {
  ok: boolean;
  routingMode?: string | null;
  portalEnabled?: boolean;
  providerCredentialsSkipped?: boolean;
  disabledProviderIds?: string[];
  errors: string[];
};

export async function importSettingsSnapshotViaApp(
  snapshot: unknown,
  options: { skipProviderCredentials?: boolean; localAppBaseUrl?: string } = {},
): Promise<SettingsSnapshotImportViaAppReport> {
  const localAppBaseUrl = options.localAppBaseUrl ?? DEFAULT_LOCAL_APP;
  const skipProviderCredentials = options.skipProviderCredentials === true;
  const query = skipProviderCredentials ? '?skipProviderCredentials=true' : '';

  try {
    const body = await requestMaintenanceJson(
      `/api/v1/ops/settings/snapshot/import${query}`,
      localAppBaseUrl,
      { method: 'POST', body: snapshot, timeoutMs: 60_000 },
    );

    if (body.ok !== true) {
      const errors = Array.isArray(body.errors)
        ? body.errors.filter((entry): entry is string => typeof entry === 'string')
        : ['Settings-Import wurde abgelehnt.'];
      return { ok: false, errors };
    }

    return {
      ok: true,
      routingMode: typeof body.routingMode === 'string' ? body.routingMode : null,
      portalEnabled: body.portalEnabled === true,
      providerCredentialsSkipped: body.providerCredentialsSkipped === true,
      disabledProviderIds: Array.isArray(body.disabledProviderIds)
        ? body.disabledProviderIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
      errors: [],
    };
  } catch (error) {
    const responseBody = error instanceof MaintenanceClientError ? error.responseBody : undefined;
    const responseErrors = responseBody?.errors;
    return {
      ok: false,
      errors: [
        ...(Array.isArray(responseErrors)
          ? responseErrors.filter((entry): entry is string => typeof entry === 'string')
          : [error instanceof Error ? error.message : 'Settings-Import nicht möglich.']),
      ],
    };
  }
}

function writePfbackupFileAtomically(backupDir: string, serialized: string): string {
  fs.mkdirSync(backupDir, { recursive: true });
  const finalName = buildPfbackupFilename();
  const finalPath = path.join(backupDir, finalName);
  const tempPath = path.join(backupDir, `.${finalName}.tmp`);

  fs.writeFileSync(tempPath, serialized, 'utf8');
  try {
    const validation = validatePfbackupContent(fs.readFileSync(tempPath, 'utf8'));
    if (!validation.archiveValid) {
      throw new Error(validation.errors.join(' ') || 'Backup-Archiv ungültig nach Schreiben.');
    }
    replaceFile(tempPath, finalPath);
    return finalPath;
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

export async function createPfbackup(
  ctx: SetupContext,
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<{ envPath: string; backupPath: string }> {
  return runHostMutation(ctx.home, 'createPfbackup', async () => {
    const envPath = path.join(ctx.home, '.env');
    if (!fs.existsSync(envPath)) {
      throw new Error('Keine .env — Setup zuerst ausführen.');
    }

    const dbSnapshot = await fetchSettingsDbSnapshotFromApp(localAppBaseUrl);
    const fullSnapshot = buildFullSettingsSnapshot(dbSnapshot, envPath);

    const restoreValidation = await validateSettingsSnapshotWithApp(fullSnapshot, localAppBaseUrl);
    if (!restoreValidation.ok) {
      throw new Error(
        restoreValidation.errors.join(' ') ||
          'Settings sind für Restore nicht importierbar — Backup abgebrochen.',
      );
    }

    const managerState: ManagerState = enrichManagerStateForStackBackup(
      readManagerStateForBackup(ctx.home),
      hostEnvRecord(envPath),
    );
    const archive = buildPfbackupArchive({
      settings: fullSnapshot,
      managerState,
      tlsArchiveBase64: buildTlsArchiveBase64(ctx) ?? undefined,
    });
    const serialized = serializePfbackupArchive(archive);
    const backupPath = writePfbackupFileAtomically(backupsDirectory(ctx.home), serialized);

    return { envPath, backupPath };
  });
}

export function buildTlsArchiveBase64(ctx: SetupContext): string | null {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    return null;
  }
  const env = hostEnvRecord(envPath);
  const tlsState = env.TLS_STATE?.trim() || 'off';
  if (tlsState === 'off') {
    return null;
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-backup-tls-'));
  const destinationPath = path.join(temporary, 'tls.tgz');
  try {
    packTlsSidecarArchive({
      installHome: ctx.home,
      installationId: env.TLS_INSTALLATION_ID?.trim() ?? '',
      hostname: env.TLS_STAFF_HOSTNAME?.trim() || env.TLS_HOSTNAME?.trim() || '',
      installationDomain: env.TLS_INSTALLATION_DOMAIN?.trim(),
      staffHostname: env.TLS_STAFF_HOSTNAME?.trim(),
      portalHostname: env.TLS_PORTAL_HOSTNAME?.trim(),
      wildcardCertificateName: env.TLS_WILDCARD_CERTIFICATE_NAME?.trim(),
      destinationPath,
    });
    return fs.readFileSync(destinationPath).toString('base64');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function getPfbackupInfo(ctx: SetupContext): {
  envPath: string;
  latestBackupPath: string | null;
} {
  return {
    envPath: path.join(ctx.home, '.env'),
    latestBackupPath: findLatestPfbackupPath(ctx.home),
  };
}

export function validatePfbackupContent(content: string): PfbackupArchiveValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { archiveValid: false, errors: ['Datei ist kein gültiges JSON.'] };
  }
  return validatePfbackupArchive(parsed);
}

export { formatPfbackupLabel };
