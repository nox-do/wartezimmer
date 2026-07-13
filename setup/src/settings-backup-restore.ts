import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  parsePfbackupArchive,
  STACK_IMAGE_ENV_KEYS,
  validateManagerStateForBackup,
  type ComposeStatus,
  type ManagerState,
  type PfbackupRestoreResult,
} from '@praxis-flow/server-shared';
import {
  createDockerAppDataAccess,
  createLocalAppDataAccess,
  type AppDataVolumeAccess,
} from './app-data-volume.js';
import { composePs, composeStop, composeUp, type ComposeRunOptions } from './docker.js';
import { readEnvMap, writeEnvRecordAtomically } from './env-file.js';
import {
  MANAGER_STATE_FILE,
  managerStatePath,
  readManagerState,
  writeManagerStateAtomically,
} from './manager-state.js';
import {
  FRESH_DB_CUTOVER_PHASES,
  runFreshDbSettingsCutover,
  type FreshDbCutoverPhase,
} from './fresh-db-settings-cutover.js';
import { checkMaintenanceAppReachable } from './settings-backup-inspect.js';
import {
  fetchSettingsDbSnapshotFromApp,
  importSettingsSnapshotViaApp,
  validatePfbackupContent,
  validateSettingsSnapshotWithApp,
  type SettingsSnapshotDbFromApp,
} from './settings-backup.js';
import type { SetupContext } from './setup-context.js';
import {
  resolveCanonicalBaseUrl,
  LOCAL_MAINTENANCE_APP_BASE_URL,
  LOCAL_SETUP_APP_BASE_URL,
} from './urls.js';
import { runConnectionProbes } from './probes.js';
import { resolveDeliveryImageConfig } from './delivery-images.js';

export const RESTORE_PHASES = {
  validateArchive: 'validate_archive',
  validateSettings: 'validate_settings',
  backupRollbackState: 'backup_rollback_state',
  stopStack: 'stop_stack',
  writeEnv: 'write_env',
  writeManagerState: 'write_manager_state',
  moveDatabase: 'move_database',
  startApp: 'start_app',
  waitMaintenance: 'wait_maintenance',
  importSnapshot: 'import_snapshot',
  verifyExport: 'verify_export',
  startFullStack: 'start_full_stack',
  healthCheck: 'health_check',
} as const;

export type RestorePhase = (typeof RESTORE_PHASES)[keyof typeof RESTORE_PHASES];

type RollbackArtifacts = {
  rollbackDir: string;
  envPath: string;
  managerStatePath: string;
  appDataDir: string;
  dbFilesBackedUp: string[];
};

export type PfbackupRestoreOptions = {
  skipProviderCredentials?: boolean;
};

export type PfbackupRestoreTestHooks = {
  afterBackupRollbackState?: () => void | Promise<void>;
  beforeWriteEnv?: () => void | Promise<void>;
  beforeStartApp?: () => void | Promise<void>;
  beforeImportSnapshot?: () => void | Promise<void>;
  beforeVerifyExport?: () => void | Promise<void>;
  failWriteEnv?: boolean;
  failStartApp?: boolean;
  failImportSnapshot?: boolean;
  failVerifyExport?: boolean;
  failRollback?: boolean;
};

export type PfbackupRestoreDeps = {
  validateArchive?: typeof validatePfbackupContent;
  validateSettings?: typeof validateSettingsSnapshotWithApp;
  stopStack?: (runOptions: ComposeRunOptions) => Promise<{ ok: boolean; log: string }>;
  startAppStack?: (
    runOptions: ComposeRunOptions,
  ) => Promise<{ ok: boolean; log: string; gatewaySkipped: boolean }>;
  startFullStack?: (
    runOptions: ComposeRunOptions,
  ) => Promise<{ ok: boolean; log: string; gatewaySkipped: boolean }>;
  waitForMaintenanceApp?: (localAppBaseUrl: string) => Promise<boolean>;
  importSnapshot?: typeof importSettingsSnapshotViaApp;
  exportDbSnapshot?: (localAppBaseUrl: string) => Promise<SettingsSnapshotDbFromApp>;
  composeStatus?: (runOptions: ComposeRunOptions) => Promise<ComposeStatus>;
  runHealthChecks?: (input: {
    localAppBaseUrl: string;
    lanAppBaseUrl: string | null;
  }) => Promise<{ ok: boolean; errors: string[] }>;
  appDataAccess?: AppDataVolumeAccess;
  localAppBaseUrl?: string;
  localMaintenanceAppBaseUrl?: string;
  now?: () => Date;
};

function createRestoreId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${randomBytes(4).toString('hex')}`;
}

function rollbackDirectory(installHome: string, restoreId: string): string {
  return path.join(installHome, 'rollback', restoreId);
}

function hostEnvRecord(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  return Object.fromEntries(readEnvMap(envPath).entries());
}

/**
 * Restore-ENV-Merge (kein vollständiges Ersetzen der `.env`):
 * - Backup-Werte gewinnen für alle im Snapshot enthaltenen Keys
 * - Aktuelle Stack-Image-Tags (`PRAXIS_FLOW_*_IMAGE`) bleiben erhalten
 * - Keys, die nur in der aktuellen `.env` existieren, bleiben erhalten
 * - Bewusstes Entfernen veralteter Keys braucht eine eigene Remove-Liste
 */
export function mergeConfigRestoreEnv(
  backupEnv: Record<string, string>,
  currentEnv: Record<string, string>,
): Record<string, string> {
  const merged = { ...backupEnv };
  for (const key of STACK_IMAGE_ENV_KEYS) {
    const current = currentEnv[key]?.trim();
    if (current) {
      merged[key] = current;
    }
  }
  return merged;
}

export function mergeConfigRestoreManagerState(
  backupState: ManagerState,
  currentState: ManagerState,
): ManagerState {
  if (!currentState.release) {
    return backupState;
  }
  if (!backupState.release) {
    return currentState;
  }
  return {
    release: {
      ...backupState.release,
      releaseVersion: currentState.release.releaseVersion,
      appImage: currentState.release.appImage,
      sandboxImage: currentState.release.sandboxImage,
      gatewayImage: currentState.release.gatewayImage,
      archiveSha256: currentState.release.archiveSha256,
    },
  };
}

function resolveComposeRunOptions(
  ctx: SetupContext,
  envMap: Map<string, string>,
): ComposeRunOptions {
  const deliveryConfig = resolveDeliveryImageConfig({
    projectRoot: ctx.home,
    envMap,
  });
  return {
    projectRoot: ctx.home,
    delivery: Boolean(deliveryConfig?.appImage),
    composeProjectName: ctx.composeProjectName,
  };
}

async function defaultWaitForMaintenanceApp(
  localAppBaseUrl: string,
  timeoutMs = 120_000,
  intervalMs = 2_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkMaintenanceAppReachable(localAppBaseUrl)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function defaultRunHealthChecks(input: {
  localAppBaseUrl: string;
  lanAppBaseUrl: string | null;
}): Promise<{ ok: boolean; errors: string[] }> {
  const probes = await runConnectionProbes({
    localAppBaseUrl: input.localAppBaseUrl,
    lanAppBaseUrl: input.lanAppBaseUrl ?? undefined,
  });
  const errors = probes.filter((probe) => !probe.ok).map((probe) => probe.message);
  return { ok: errors.length === 0, errors };
}

function restorePhaseFromCutover(phase: FreshDbCutoverPhase): RestorePhase {
  switch (phase) {
    case FRESH_DB_CUTOVER_PHASES.moveDatabase:
      return RESTORE_PHASES.moveDatabase;
    case FRESH_DB_CUTOVER_PHASES.startApp:
      return RESTORE_PHASES.startApp;
    case FRESH_DB_CUTOVER_PHASES.waitMaintenance:
      return RESTORE_PHASES.waitMaintenance;
    case FRESH_DB_CUTOVER_PHASES.prepareImport:
    case FRESH_DB_CUTOVER_PHASES.importSnapshot:
      return RESTORE_PHASES.importSnapshot;
    case FRESH_DB_CUTOVER_PHASES.verifyExport:
      return RESTORE_PHASES.verifyExport;
    case FRESH_DB_CUTOVER_PHASES.startFullStack:
      return RESTORE_PHASES.startFullStack;
    case FRESH_DB_CUTOVER_PHASES.healthCheck:
      return RESTORE_PHASES.healthCheck;
  }
}

function parseArchiveContent(content: string): {
  settings: Record<string, unknown>;
  managerState: ManagerState;
} {
  const archive = parsePfbackupArchive(JSON.parse(content));
  const settings = JSON.parse(archive.settingsJson) as Record<string, unknown>;
  const managerValidation = validateManagerStateForBackup(JSON.parse(archive.managerStateJson));
  if (!managerValidation.ok || !managerValidation.state) {
    throw new Error(managerValidation.errors.join(' '));
  }
  return { settings, managerState: managerValidation.state };
}

async function backupRollbackArtifactsAfterStop(
  ctx: SetupContext,
  restoreId: string,
  appDataAccess: AppDataVolumeAccess,
): Promise<RollbackArtifacts> {
  const rollbackDir = rollbackDirectory(ctx.home, restoreId);
  const envPath = path.join(ctx.home, '.env');
  const managerPath = managerStatePath(ctx.home);
  const appDataDir = path.join(rollbackDir, 'app-data');
  fs.mkdirSync(rollbackDir, { recursive: true });

  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, path.join(rollbackDir, '.env'));
  }
  if (fs.existsSync(managerPath)) {
    fs.copyFileSync(managerPath, path.join(rollbackDir, MANAGER_STATE_FILE));
  }

  const dbFilesBackedUp = await appDataAccess.backupDbFiles(appDataDir);
  return {
    rollbackDir,
    envPath,
    managerStatePath: managerPath,
    appDataDir,
    dbFilesBackedUp,
  };
}

async function executeRollback(input: {
  ctx: SetupContext;
  rollback: RollbackArtifacts;
  appDataAccess: AppDataVolumeAccess;
  stopStack: PfbackupRestoreDeps['stopStack'];
  startFullStack: PfbackupRestoreDeps['startFullStack'];
  composeStatus: PfbackupRestoreDeps['composeStatus'];
  localAppBaseUrl: string;
  failRollback?: boolean;
}): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  if (input.failRollback) {
    return { ok: false, errors: ['Rollback absichtlich fehlgeschlagen (Test).'] };
  }

  const envMap = readEnvMap(path.join(input.ctx.home, '.env'));
  const runOptions = resolveComposeRunOptions(input.ctx, envMap);

  const stop = await input.stopStack!(runOptions);
  if (!stop.ok) {
    errors.push(stop.log || 'Stack konnte für Rollback nicht gestoppt werden.');
  }

  const rollbackEnv = path.join(input.rollback.rollbackDir, '.env');
  if (fs.existsSync(rollbackEnv)) {
    fs.copyFileSync(rollbackEnv, path.join(input.ctx.home, '.env'));
  } else {
    errors.push('Rollback-.env fehlt.');
  }

  const rollbackManager = path.join(input.rollback.rollbackDir, MANAGER_STATE_FILE);
  if (fs.existsSync(rollbackManager)) {
    fs.copyFileSync(rollbackManager, input.rollback.managerStatePath);
  } else if (fs.existsSync(input.rollback.managerStatePath)) {
    fs.unlinkSync(input.rollback.managerStatePath);
  }

  const failedRestoreDir = path.join(input.rollback.rollbackDir, 'failed-restore-db');
  try {
    await input.appDataAccess.moveDbAside(failedRestoreDir);
  } catch (error) {
    errors.push(
      error instanceof Error
        ? error.message
        : 'Neue Runtime-DB konnte nicht beiseitegelegt werden.',
    );
  }
  try {
    await input.appDataAccess.restoreDbFiles(input.rollback.appDataDir);
  } catch (error) {
    errors.push(
      error instanceof Error
        ? error.message
        : 'Rollback-Runtime-DB konnte nicht zurückgespielt werden.',
    );
  }

  const envAfterRollback = readEnvMap(path.join(input.ctx.home, '.env'));
  const runOptionsAfter = resolveComposeRunOptions(input.ctx, envAfterRollback);
  const up = await input.startFullStack!(runOptionsAfter);
  if (!up.ok) {
    errors.push(up.log || 'Stack konnte nach Rollback nicht gestartet werden.');
  }

  const health = await defaultRunHealthChecks({
    localAppBaseUrl: input.localAppBaseUrl,
    lanAppBaseUrl: resolveCanonicalBaseUrl(
      envAfterRollback,
      envAfterRollback.get('SETUP_LAN_APP_IP'),
    ),
  });
  if (!health.ok) {
    errors.push(...health.errors);
  }

  const compose = await input.composeStatus!(runOptionsAfter);
  if (!compose.running) {
    errors.push('Compose meldet nach Rollback keinen laufenden Stack.');
  }

  return { ok: errors.length === 0, errors };
}

function failureResult(
  restoreId: string,
  failedPhase: RestorePhase,
  errors: string[],
  rollbackAttempted: boolean,
  rollbackSucceeded: boolean,
): PfbackupRestoreResult {
  return {
    ok: false,
    restoreId,
    failedPhase,
    rollbackAttempted,
    rollbackSucceeded,
    errors,
  };
}

function failureWithRollback(
  restoreId: string,
  failedPhase: RestorePhase,
  originalErrors: string[],
  rollbackResult: { ok: boolean; errors: string[] },
): PfbackupRestoreResult {
  return failureResult(
    restoreId,
    failedPhase,
    [...originalErrors, ...rollbackResult.errors.map((error) => `Rollback: ${error}`)],
    true,
    rollbackResult.ok,
  );
}

export async function restorePfbackup(
  content: string,
  ctx: SetupContext,
  options: PfbackupRestoreOptions = {},
  deps: PfbackupRestoreDeps = {},
  testHooks: PfbackupRestoreTestHooks = {},
): Promise<PfbackupRestoreResult> {
  const restoreId = createRestoreId(deps.now?.());
  const localMaintenanceAppBaseUrl =
    deps.localMaintenanceAppBaseUrl ?? LOCAL_MAINTENANCE_APP_BASE_URL;
  const localAppBaseUrl = deps.localAppBaseUrl ?? LOCAL_SETUP_APP_BASE_URL;
  const skipProviderCredentials = options.skipProviderCredentials === true;

  const validateArchive = deps.validateArchive ?? validatePfbackupContent;
  const validateSettings = deps.validateSettings ?? validateSettingsSnapshotWithApp;
  const stopStack = deps.stopStack ?? composeStop;
  const startAppStack =
    deps.startAppStack ??
    (async (runOptions) =>
      composeUp({ ...runOptions, build: false, services: ['sandbox', 'app'] }));
  const startFullStack =
    deps.startFullStack ?? (async (runOptions) => composeUp({ ...runOptions, build: false }));
  const waitForMaintenanceApp =
    deps.waitForMaintenanceApp ?? ((baseUrl: string) => defaultWaitForMaintenanceApp(baseUrl));
  const importSnapshot = deps.importSnapshot ?? importSettingsSnapshotViaApp;
  const exportDbSnapshot =
    deps.exportDbSnapshot ?? ((baseUrl: string) => fetchSettingsDbSnapshotFromApp(baseUrl));
  const composeStatus = deps.composeStatus ?? composePs;
  const runHealthChecks = deps.runHealthChecks ?? defaultRunHealthChecks;

  let rollback: RollbackArtifacts;

  const archiveResult = validateArchive(content);
  if (!archiveResult.archiveValid) {
    return failureResult(
      restoreId,
      RESTORE_PHASES.validateArchive,
      archiveResult.errors,
      false,
      false,
    );
  }

  let settings: Record<string, unknown>;
  let backupManagerState: ManagerState;
  try {
    const parsed = parseArchiveContent(content);
    settings = parsed.settings;
    backupManagerState = parsed.managerState;
  } catch (error) {
    return failureResult(
      restoreId,
      RESTORE_PHASES.validateArchive,
      [error instanceof Error ? error.message : 'Backup-Archiv konnte nicht gelesen werden.'],
      false,
      false,
    );
  }

  const settingsValidation = await validateSettings(settings, localMaintenanceAppBaseUrl);
  if (!settingsValidation.ok) {
    return failureResult(
      restoreId,
      RESTORE_PHASES.validateSettings,
      settingsValidation.errors,
      false,
      false,
    );
  }

  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    return failureResult(
      restoreId,
      RESTORE_PHASES.backupRollbackState,
      ['Keine .env — Setup zuerst ausführen.'],
      false,
      false,
    );
  }

  const envMap = readEnvMap(envPath);
  const runOptions = resolveComposeRunOptions(ctx, envMap);
  const utilityImage = envMap.get('PRAXIS_FLOW_APP_IMAGE')?.trim() ?? '';
  const appDataAccess =
    deps.appDataAccess ?? createDockerAppDataAccess(ctx.composeProjectName, utilityImage);

  const currentEnv = hostEnvRecord(envPath);
  const currentManagerState = readManagerState(ctx.home);
  const backupEnv =
    settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
      ? (settings.env as Record<string, string>)
      : {};
  const restoreEnv = mergeConfigRestoreEnv(backupEnv, currentEnv);
  const restoreManagerState = mergeConfigRestoreManagerState(
    backupManagerState,
    currentManagerState,
  );

  const stop = await stopStack(runOptions);
  if (!stop.ok) {
    return failureResult(
      restoreId,
      RESTORE_PHASES.stopStack,
      [stop.log || 'Stack konnte nicht gestoppt werden.'],
      false,
      false,
    );
  }

  try {
    rollback = await backupRollbackArtifactsAfterStop(ctx, restoreId, appDataAccess);
    await testHooks.afterBackupRollbackState?.();
  } catch (error) {
    const restart = await startFullStack(runOptions);
    const errors = [error instanceof Error ? error.message : 'Rollback-Sicherung fehlgeschlagen.'];
    if (!restart.ok) {
      errors.push(
        restart.log ||
          'Stack konnte nach fehlgeschlagener Rollback-Sicherung nicht neu gestartet werden.',
      );
    }
    return failureResult(restoreId, RESTORE_PHASES.backupRollbackState, errors, false, false);
  }

  try {
    await testHooks.beforeWriteEnv?.();
    if (testHooks.failWriteEnv) {
      throw new Error('ENV-Schreiben absichtlich fehlgeschlagen (Test).');
    }
    writeEnvRecordAtomically(envPath, restoreEnv);
  } catch (error) {
    const rollbackResult = await executeRollback({
      ctx,
      rollback: rollback!,
      appDataAccess,
      stopStack,
      startFullStack,
      composeStatus,
      localAppBaseUrl,
      failRollback: testHooks.failRollback,
    });
    return failureWithRollback(
      restoreId,
      RESTORE_PHASES.writeEnv,
      [error instanceof Error ? error.message : 'Backup-.env konnte nicht geschrieben werden.'],
      rollbackResult,
    );
  }

  try {
    writeManagerStateAtomically(ctx.home, restoreManagerState);
  } catch (error) {
    const rollbackResult = await executeRollback({
      ctx,
      rollback: rollback!,
      appDataAccess,
      stopStack,
      startFullStack,
      composeStatus,
      localAppBaseUrl,
      failRollback: testHooks.failRollback,
    });
    return failureWithRollback(
      restoreId,
      RESTORE_PHASES.writeManagerState,
      [
        error instanceof Error
          ? error.message
          : 'Backup-manager-state.json konnte nicht geschrieben werden.',
      ],
      rollbackResult,
    );
  }

  const envAfterWrite = readEnvMap(envPath);
  const runOptionsAfterWrite = resolveComposeRunOptions(ctx, envAfterWrite);

  const cutoverResult = await runFreshDbSettingsCutover(
    {
      rollbackDir: rollback!.rollbackDir,
      dbAsideSubdir: 'pre-restore-db',
      runOptions: runOptionsAfterWrite,
      envAfterWrite,
      importPayload: settings,
      skipProviderCredentials,
      verifyMismatchMessage: 'Re-exportierter Settings-Snapshot weicht vom importierten Backup ab.',
      localAppBaseUrl,
      localMaintenanceAppBaseUrl,
    },
    {
      appDataAccess,
      startAppStack,
      startFullStack,
      waitForMaintenanceApp,
      importSnapshot,
      exportDbSnapshot,
      composeStatus,
      runHealthChecks,
    },
    {
      beforeStartApp: testHooks.beforeStartApp,
      beforeImportSnapshot: testHooks.beforeImportSnapshot,
      beforeVerifyExport: testHooks.beforeVerifyExport,
      failStartApp: testHooks.failStartApp,
      failImportSnapshot: testHooks.failImportSnapshot,
      failVerifyExport: testHooks.failVerifyExport,
    },
  );

  if (!cutoverResult.ok) {
    const rollbackResult = await executeRollback({
      ctx,
      rollback: rollback!,
      appDataAccess,
      stopStack,
      startFullStack,
      composeStatus,
      localAppBaseUrl,
      failRollback: testHooks.failRollback,
    });
    return failureWithRollback(
      restoreId,
      restorePhaseFromCutover(cutoverResult.failedPhase),
      cutoverResult.errors,
      rollbackResult,
    );
  }

  const { importResult, compose } = cutoverResult;

  const opsSettings =
    settings.opsSettings && typeof settings.opsSettings === 'object'
      ? (settings.opsSettings as Record<string, unknown>)
      : null;

  return {
    ok: true,
    restoreId,
    report: {
      restoreId,
      routingMode:
        importResult.routingMode ??
        (typeof opsSettings?.routingMode === 'string' ? opsSettings.routingMode : null),
      portalEnabled: importResult.portalEnabled ?? opsSettings?.portalEnabled === true,
      providerCredentialsSkipped:
        importResult.providerCredentialsSkipped ?? skipProviderCredentials,
      disabledProviderIds: importResult.disabledProviderIds ?? [],
      compose,
    },
  };
}

export { createLocalAppDataAccess, type AppDataVolumeAccess };
