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
} from '@praxis-flow/server-shared';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';
import { readEnvMap } from './env-file.js';
import { readManagerStateForBackup } from './manager-state.js';
import type { SetupContext } from './setup-context.js';
import { packTlsSidecarArchive } from './tls-backup-sidecar.js';
import { maintenanceRequestHeaders } from './maintenance-auth.js';

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
    .filter((name) => name.startsWith('praxis-flow-backup-') && name.endsWith('.pfbackup'))
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
  const response = await fetch(
    `${localAppBaseUrl.replace(/\/$/, '')}/api/v1/ops/settings/snapshot`,
    {
      method: 'GET',
      headers: maintenanceRequestHeaders(),
      signal: AbortSignal.timeout(15_000),
    },
  );

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof body.message === 'string'
        ? body.message
        : `App-API-Fehler (${response.status}) beim Settings-Export.`;
    throw new Error(message);
  }

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

  const gatewayFromEnv = env.PRAXIS_FLOW_GATEWAY_IMAGE?.trim();
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
    const response = await fetch(
      `${localAppBaseUrl.replace(/\/$/, '')}/api/v1/ops/settings/snapshot/validate`,
      {
        method: 'POST',
        headers: {
          ...maintenanceRequestHeaders({ 'content-type': 'application/json' }),
        },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      errors?: string[];
      code?: string;
      message?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        errors: [
          typeof body.message === 'string'
            ? body.message
            : `App-Validierung fehlgeschlagen (${response.status}).`,
        ],
      };
    }

    return {
      ok: body.ok === true,
      errors: Array.isArray(body.errors) ? body.errors : [],
      code: typeof body.code === 'string' ? body.code : undefined,
    };
  } catch {
    return {
      ok: false,
      errors: [
        'Praxis Flow Maintenance-API ist nicht erreichbar (Port 8082) — Restore-Validierung nicht möglich.',
      ],
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
    const response = await fetch(
      `${localAppBaseUrl.replace(/\/$/, '')}/api/v1/ops/settings/snapshot/import${query}`,
      {
        method: 'POST',
        headers: {
          ...maintenanceRequestHeaders({ 'content-type': 'application/json' }),
        },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.timeout(60_000),
      },
    );

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errors = Array.isArray(body.errors)
        ? body.errors.filter((entry): entry is string => typeof entry === 'string')
        : [
            typeof body.message === 'string'
              ? body.message
              : `Settings-Import fehlgeschlagen (${response.status}).`,
          ];
      return { ok: false, errors };
    }

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
  } catch {
    return {
      ok: false,
      errors: [
        'Praxis Flow Maintenance-API ist nicht erreichbar (Port 8082) — Import nicht möglich.',
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
    fs.renameSync(tempPath, finalPath);
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

export function validatePfbackupFile(backupPath: string): PfbackupArchiveValidationResult {
  if (!fs.existsSync(backupPath)) {
    return { archiveValid: false, errors: ['Backup-Datei nicht gefunden.'] };
  }
  return validatePfbackupContent(fs.readFileSync(backupPath, 'utf8'));
}

export { formatPfbackupLabel };
