import path from 'node:path';
import type { ComposeStatus } from '@praxis-flow/server-shared';
import type { AppDataVolumeAccess } from './app-data-volume.js';
import type { ComposeRunOptions } from './docker.js';
import type { SettingsSnapshotImportViaAppReport } from './settings-backup.js';
import type { SettingsSnapshotDbFromApp } from './settings-backup.js';
import { resolveCanonicalBaseUrl } from './urls.js';
import {
  buildExpectedDbSnapshotAfterImport,
  dbSnapshotsEquivalent,
} from './settings-snapshot-db-verify.js';

export const FRESH_DB_CUTOVER_PHASES = {
  moveDatabase: 'move_database',
  startApp: 'start_app',
  waitMaintenance: 'wait_maintenance',
  prepareImport: 'prepare_import',
  importSnapshot: 'import_snapshot',
  verifyExport: 'verify_export',
  startFullStack: 'start_full_stack',
  healthCheck: 'health_check',
} as const;

export type FreshDbCutoverPhase =
  (typeof FRESH_DB_CUTOVER_PHASES)[keyof typeof FRESH_DB_CUTOVER_PHASES];

export type FreshDbCutoverPrepareImportResult =
  | {
      ok: true;
      importPayload: Record<string, unknown>;
      skipProviderCredentials?: boolean;
    }
  | { ok: false; errors: string[] };

export type FreshDbCutoverInput = {
  rollbackDir: string;
  dbAsideSubdir: string;
  runOptions: ComposeRunOptions;
  envAfterWrite: Map<string, string>;
  importPayload?: Record<string, unknown>;
  skipProviderCredentials?: boolean;
  prepareImport?: () => Promise<FreshDbCutoverPrepareImportResult>;
  verifyMismatchMessage?: string;
  localAppBaseUrl: string;
  localMaintenanceAppBaseUrl: string;
};

export type FreshDbCutoverDeps = {
  appDataAccess: AppDataVolumeAccess;
  startAppStack: (
    runOptions: ComposeRunOptions,
  ) => Promise<{ ok: boolean; log: string; gatewaySkipped: boolean }>;
  startFullStack: (
    runOptions: ComposeRunOptions,
  ) => Promise<{ ok: boolean; log: string; gatewaySkipped: boolean }>;
  waitForMaintenanceApp: (localAppBaseUrl: string) => Promise<boolean>;
  importSnapshot: (
    snapshot: unknown,
    options: { skipProviderCredentials?: boolean; localAppBaseUrl?: string },
  ) => Promise<SettingsSnapshotImportViaAppReport>;
  exportDbSnapshot: (localAppBaseUrl: string) => Promise<SettingsSnapshotDbFromApp>;
  composeStatus: (runOptions: ComposeRunOptions) => Promise<ComposeStatus>;
  runHealthChecks: (input: {
    localAppBaseUrl: string;
    lanAppBaseUrl: string | null;
  }) => Promise<{ ok: boolean; errors: string[] }>;
};

export type FreshDbCutoverTestHooks = {
  beforeStartApp?: () => void | Promise<void>;
  beforeImportSnapshot?: () => void | Promise<void>;
  beforeVerifyExport?: () => void | Promise<void>;
  failStartApp?: boolean;
  failImportSnapshot?: boolean;
  failVerifyExport?: boolean;
};

export type FreshDbCutoverSuccess = {
  ok: true;
  importResult: SettingsSnapshotImportViaAppReport;
  compose: ComposeStatus;
};

export type FreshDbCutoverFailure = {
  ok: false;
  failedPhase: FreshDbCutoverPhase;
  errors: string[];
};

export type FreshDbCutoverResult = FreshDbCutoverSuccess | FreshDbCutoverFailure;

function failure(
  failedPhase: FreshDbCutoverPhase,
  errors: string[],
): FreshDbCutoverFailure {
  return { ok: false, failedPhase, errors };
}

export async function runFreshDbSettingsCutover(
  input: FreshDbCutoverInput,
  deps: FreshDbCutoverDeps,
  testHooks: FreshDbCutoverTestHooks = {},
): Promise<FreshDbCutoverResult> {
  const verifyMismatchMessage =
    input.verifyMismatchMessage ??
    'Re-exportierter Settings-Snapshot weicht vom importierten Backup ab.';

  try {
    const asideDir = path.join(input.rollbackDir, input.dbAsideSubdir);
    await deps.appDataAccess.moveDbAside(asideDir);
  } catch (error) {
    return failure(FRESH_DB_CUTOVER_PHASES.moveDatabase, [
      error instanceof Error ? error.message : 'Alte Runtime-DB konnte nicht verschoben werden.',
    ]);
  }

  await testHooks.beforeStartApp?.();
  if (testHooks.failStartApp) {
    return failure(FRESH_DB_CUTOVER_PHASES.startApp, ['App-Start absichtlich fehlgeschlagen (Test).']);
  }

  const appStart = await deps.startAppStack(input.runOptions);
  if (!appStart.ok) {
    return failure(FRESH_DB_CUTOVER_PHASES.startApp, [
      appStart.log || 'App konnte nicht gestartet werden.',
    ]);
  }

  const maintenanceReady = await deps.waitForMaintenanceApp(input.localMaintenanceAppBaseUrl);
  if (!maintenanceReady) {
    return failure(FRESH_DB_CUTOVER_PHASES.waitMaintenance, [
      'Maintenance-API (Port 8082) wurde nicht erreichbar.',
    ]);
  }

  let importPayload = input.importPayload;
  let skipProviderCredentials = input.skipProviderCredentials === true;
  if (input.prepareImport) {
    const prepared = await input.prepareImport();
    if (!prepared.ok) {
      return failure(FRESH_DB_CUTOVER_PHASES.prepareImport, prepared.errors);
    }
    importPayload = prepared.importPayload;
    skipProviderCredentials = prepared.skipProviderCredentials === true;
  }

  if (!importPayload) {
    return failure(FRESH_DB_CUTOVER_PHASES.prepareImport, [
      'Import-Payload fehlt für Fresh-DB-Cutover.',
    ]);
  }

  await testHooks.beforeImportSnapshot?.();
  if (testHooks.failImportSnapshot) {
    return failure(FRESH_DB_CUTOVER_PHASES.importSnapshot, [
      'Settings-Import absichtlich fehlgeschlagen (Test).',
    ]);
  }

  const importResult = await deps.importSnapshot(importPayload, {
    skipProviderCredentials,
    localAppBaseUrl: input.localMaintenanceAppBaseUrl,
  });
  if (!importResult.ok) {
    return failure(FRESH_DB_CUTOVER_PHASES.importSnapshot, importResult.errors);
  }

  await testHooks.beforeVerifyExport?.();
  if (testHooks.failVerifyExport) {
    return failure(FRESH_DB_CUTOVER_PHASES.verifyExport, [
      'Re-Export-Vergleich absichtlich fehlgeschlagen (Test).',
    ]);
  }

  let exportedDb: SettingsSnapshotDbFromApp;
  try {
    exportedDb = await deps.exportDbSnapshot(input.localMaintenanceAppBaseUrl);
  } catch (error) {
    return failure(FRESH_DB_CUTOVER_PHASES.verifyExport, [
      error instanceof Error ? error.message : 'Settings-Re-Export fehlgeschlagen.',
    ]);
  }

  const expectedDb = buildExpectedDbSnapshotAfterImport(importPayload, {
    skipProviderCredentials,
  });
  if (!dbSnapshotsEquivalent(exportedDb, expectedDb)) {
    return failure(FRESH_DB_CUTOVER_PHASES.verifyExport, [verifyMismatchMessage]);
  }

  const fullStart = await deps.startFullStack(input.runOptions);
  if (!fullStart.ok) {
    return failure(FRESH_DB_CUTOVER_PHASES.startFullStack, [
      fullStart.log || 'Vollständiger Stack konnte nicht gestartet werden.',
    ]);
  }

  const compose = await deps.composeStatus(input.runOptions);
  const lanAppBaseUrl = resolveCanonicalBaseUrl(
    input.envAfterWrite,
    input.envAfterWrite.get('SETUP_LAN_APP_IP'),
  );
  const health = await deps.runHealthChecks({
    localAppBaseUrl: input.localAppBaseUrl,
    lanAppBaseUrl,
  });
  if (!health.ok) {
    return failure(FRESH_DB_CUTOVER_PHASES.healthCheck, health.errors);
  }

  return {
    ok: true,
    importResult,
    compose,
  };
}
