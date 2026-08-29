import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  parsePfbackupArchive,
  STACK_IMAGE_ENV_KEYS,
  tlsRestoreBlockedCopy,
  tlsRestoreSupported,
  validateManagerStateForBackup,
  type ManagerState,
  type PfbackupRestoreResult,
} from '@praxis-flow/server-shared';
import {
  createDockerAppDataAccess,
  createLocalAppDataAccess,
  type AppDataVolumeAccess,
} from './app-data-volume.js';
import { composePs, composeStop, composeUp, type ComposeRunOptions } from './docker.js';
import { readEnvMap, writeEnvRecordAtomically, removeEnvKeys } from './env-file.js';
import { readManagerState, writeManagerStateAtomically } from './manager-state.js';
import {
  FRESH_DB_CUTOVER_PHASES,
  runFreshDbSettingsCutover,
  type FreshDbCutoverPhase,
} from './fresh-db-settings-cutover.js';
import { checkMaintenanceAppReachable, buildPfbackupTlsInspectSummary } from './settings-backup-inspect.js';
import {
  fetchSettingsDbSnapshotFromApp,
  importSettingsSnapshotViaApp,
  validatePfbackupContent,
  validateSettingsSnapshotWithApp,
  type SettingsSnapshotDbFromApp,
} from './settings-backup.js';
import type { SetupContext } from './setup-context.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL, LOCAL_SETUP_APP_BASE_URL } from './urls.js';
import {
  captureMaintenanceRollback,
  executeMaintenanceRollback,
  readHostEnvRecord,
  resolveMaintenanceComposeRunOptions,
  runDefaultMaintenanceHealthChecks,
  type MaintenanceRollbackArtifacts,
  type MaintenanceStackRuntime,
} from './maintenance-rollback.js';
import { TLS_ENV_KEYS, readTlsStatus } from './host-tls.js';
import {
  buildProxyTlsEnvUpdates,
  PROXY_TLS_HOST_PATH_ENV_KEYS,
  PROXY_TLS_RUNTIME_ENV_KEYS,
  writeGeneratedTlsCaddyfile,
} from './proxy-tls.js';
import {
  decodeTlsSidecarBase64,
  unpackTlsSidecarBytes,
  wipeTlsStateRoot,
} from './tls-backup-sidecar.js';

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
  cutover: 'cutover',
} as const;

export type RestorePhase = (typeof RESTORE_PHASES)[keyof typeof RESTORE_PHASES];

export type PfbackupRestoreOptions = {
  skipProviderCredentials?: boolean;
  tlsSidecarBase64?: string;
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
  stopStack?: MaintenanceStackRuntime['stopStack'];
  startAppStack?: (
    runOptions: ComposeRunOptions,
  ) => Promise<{ ok: boolean; log: string; gatewaySkipped: boolean }>;
  startFullStack?: MaintenanceStackRuntime['startFullStack'];
  waitForMaintenanceApp?: (localAppBaseUrl: string) => Promise<boolean>;
  importSnapshot?: typeof importSettingsSnapshotViaApp;
  exportDbSnapshot?: (localAppBaseUrl: string) => Promise<SettingsSnapshotDbFromApp>;
  composeStatus?: MaintenanceStackRuntime['composeStatus'];
  runHealthChecks?: MaintenanceStackRuntime['runHealthChecks'];
  appDataAccess?: AppDataVolumeAccess;
  localAppBaseUrl?: string;
  localMaintenanceAppBaseUrl?: string;
  now?: () => Date;
};

type RestoreRuntime = MaintenanceStackRuntime & {
  validateArchive: typeof validatePfbackupContent;
  validateSettings: typeof validateSettingsSnapshotWithApp;
  startAppStack: NonNullable<PfbackupRestoreDeps['startAppStack']>;
  waitForMaintenanceApp: NonNullable<PfbackupRestoreDeps['waitForMaintenanceApp']>;
  importSnapshot: typeof importSettingsSnapshotViaApp;
  exportDbSnapshot: NonNullable<PfbackupRestoreDeps['exportDbSnapshot']>;
  appDataAccess?: AppDataVolumeAccess;
};

type PreparedRestore = {
  settings: Record<string, unknown>;
  restoreEnv: Record<string, string>;
  restoreManagerState: ManagerState;
  envPath: string;
  runOptions: ComposeRunOptions;
  appDataAccess: AppDataVolumeAccess;
  tlsSidecarBytes: Buffer | null;
  discardTlsPreparation: boolean;
};

class RestorePhaseError extends Error {
  constructor(
    readonly phase: RestorePhase,
    readonly errors: string[],
  ) {
    super(errors.join(' '));
  }
}

function createRestoreId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${randomBytes(4).toString('hex')}`;
}

function rollbackDirectory(installHome: string, restoreId: string): string {
  return path.join(installHome, 'rollback', restoreId);
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
): Promise<MaintenanceRollbackArtifacts> {
  return captureMaintenanceRollback(ctx, rollbackDirectory(ctx.home, restoreId), appDataAccess);
}

async function executeRollback(input: {
  ctx: SetupContext;
  rollback: MaintenanceRollbackArtifacts;
  appDataAccess: AppDataVolumeAccess;
  runtime: RestoreRuntime;
  localAppBaseUrl: string;
  failRollback?: boolean;
}): Promise<{ ok: boolean; errors: string[] }> {
  if (input.failRollback) {
    return { ok: false, errors: ['Rollback absichtlich fehlgeschlagen (Test).'] };
  }
  return executeMaintenanceRollback({
    ctx: input.ctx,
    rollback: input.rollback,
    appDataAccess: input.appDataAccess,
    runtime: input.runtime,
    localAppBaseUrl: input.localAppBaseUrl,
    failedDbDirName: 'failed-restore-db',
  });
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function resolveRestoreRuntime(deps: PfbackupRestoreDeps): RestoreRuntime {
  return {
    validateArchive: deps.validateArchive ?? validatePfbackupContent,
    validateSettings: deps.validateSettings ?? validateSettingsSnapshotWithApp,
    stopStack: deps.stopStack ?? composeStop,
    startAppStack:
      deps.startAppStack ??
      (async (runOptions) =>
        composeUp({ ...runOptions, build: false, services: ['sandbox', 'app'] })),
    startFullStack:
      deps.startFullStack ?? (async (runOptions) => composeUp({ ...runOptions, build: false })),
    waitForMaintenanceApp:
      deps.waitForMaintenanceApp ?? ((baseUrl) => defaultWaitForMaintenanceApp(baseUrl)),
    importSnapshot: deps.importSnapshot ?? importSettingsSnapshotViaApp,
    exportDbSnapshot:
      deps.exportDbSnapshot ?? ((baseUrl) => fetchSettingsDbSnapshotFromApp(baseUrl)),
    composeStatus: deps.composeStatus ?? composePs,
    runHealthChecks: deps.runHealthChecks ?? runDefaultMaintenanceHealthChecks,
    appDataAccess: deps.appDataAccess,
  };
}

function stripTlsPreparationKeys(env: Record<string, string>): void {
  for (const key of [...TLS_ENV_KEYS, ...PROXY_TLS_HOST_PATH_ENV_KEYS, ...PROXY_TLS_RUNTIME_ENV_KEYS]) {
    delete env[key];
  }
}

function applyTlsRestorePlan(input: {
  backupEnv: Record<string, string>;
  restoreEnv: Record<string, string>;
  tlsSidecarBase64: string | undefined;
  installHome: string;
}): { restoreEnv: Record<string, string>; tlsSidecarBytes: Buffer | null; discardTlsPreparation: boolean } {
  const tls = buildPfbackupTlsInspectSummary(input.backupEnv, input.tlsSidecarBase64);
  if (!tls) {
    return { restoreEnv: input.restoreEnv, tlsSidecarBytes: null, discardTlsPreparation: false };
  }

  const supported = tlsRestoreSupported({
    archiveValid: true,
    settingsValid: true,
    targetAppReachable: true,
    tlsMetadataConsistent: tls.metadataConsistent,
    tlsClaimsHttps: tls.inBackup,
    sidecarPresent: tls.sidecarPresent,
    sidecarMatches: tls.sidecarMatches,
  });
  if (!supported) {
    const blocked = tlsRestoreBlockedCopy({
      tlsMetadataConsistent: tls.metadataConsistent,
      tlsClaimsHttps: tls.inBackup,
      sidecarPresent: tls.sidecarPresent,
      sidecarMatches: tls.sidecarMatches,
    });
    throw new RestorePhaseError(RESTORE_PHASES.validateArchive, [
      blocked ?? 'HTTPS-Restore wird nicht unterstützt.',
    ]);
  }

  const sidecarBytes = decodeTlsSidecarBase64(input.tlsSidecarBase64);
  const matchingSidecar = Boolean(tls.sidecarPresent && tls.sidecarMatches && sidecarBytes);
  if (tls.inBackup && !matchingSidecar) {
    throw new RestorePhaseError(RESTORE_PHASES.validateArchive, [
      tlsRestoreBlockedCopy({
        tlsMetadataConsistent: tls.metadataConsistent,
        tlsClaimsHttps: true,
        sidecarPresent: tls.sidecarPresent,
        sidecarMatches: tls.sidecarMatches,
      }) ?? 'HTTPS-Restore ohne passendes Sidecar ist abgelehnt.',
    ]);
  }

  const restoreEnv = { ...input.restoreEnv };
  if (tls.preparedInBackup && !matchingSidecar) {
    stripTlsPreparationKeys(restoreEnv);
    return { restoreEnv, tlsSidecarBytes: null, discardTlsPreparation: true };
  }

  if (matchingSidecar) {
    Object.assign(restoreEnv, buildProxyTlsEnvUpdates(input.installHome));
    return { restoreEnv, tlsSidecarBytes: sidecarBytes, discardTlsPreparation: false };
  }

  return { restoreEnv, tlsSidecarBytes: null, discardTlsPreparation: false };
}

async function prepareRestore(input: {
  content: string;
  ctx: SetupContext;
  runtime: RestoreRuntime;
  localMaintenanceAppBaseUrl: string;
  tlsSidecarBase64?: string;
}): Promise<PreparedRestore> {
  const archiveResult = input.runtime.validateArchive(input.content);
  if (!archiveResult.archiveValid) {
    throw new RestorePhaseError(RESTORE_PHASES.validateArchive, archiveResult.errors);
  }

  let parsed: ReturnType<typeof parseArchiveContent>;
  try {
    parsed = parseArchiveContent(input.content);
  } catch (error) {
    throw new RestorePhaseError(RESTORE_PHASES.validateArchive, [
      errorMessage(error, 'Backup-Archiv konnte nicht gelesen werden.'),
    ]);
  }

  const validation = await input.runtime.validateSettings(
    parsed.settings,
    input.localMaintenanceAppBaseUrl,
  );
  if (!validation.ok) {
    throw new RestorePhaseError(RESTORE_PHASES.validateSettings, validation.errors);
  }

  const envPath = path.join(input.ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    throw new RestorePhaseError(RESTORE_PHASES.backupRollbackState, [
      'Keine .env — Setup zuerst ausführen.',
    ]);
  }
  const envMap = readEnvMap(envPath);
  const backupEnv =
    parsed.settings.env &&
    typeof parsed.settings.env === 'object' &&
    !Array.isArray(parsed.settings.env)
      ? (parsed.settings.env as Record<string, string>)
      : {};
  const tlsPlan = applyTlsRestorePlan({
    backupEnv,
    restoreEnv: mergeConfigRestoreEnv(backupEnv, readHostEnvRecord(envPath)),
    tlsSidecarBase64: input.tlsSidecarBase64,
    installHome: input.ctx.home,
  });
  return {
    settings: parsed.settings,
    restoreEnv: tlsPlan.restoreEnv,
    restoreManagerState: mergeConfigRestoreManagerState(
      parsed.managerState,
      readManagerState(input.ctx.home),
    ),
    envPath,
    runOptions: resolveMaintenanceComposeRunOptions(input.ctx, envMap),
    appDataAccess:
      input.runtime.appDataAccess ??
      createDockerAppDataAccess(
        input.ctx.composeProjectName,
        envMap.get('PRAXIS_FLOW_APP_IMAGE')?.trim() ?? '',
      ),
    tlsSidecarBytes: tlsPlan.tlsSidecarBytes,
    discardTlsPreparation: tlsPlan.discardTlsPreparation,
  };
}

async function commitRestore(input: {
  prepared: PreparedRestore;
  ctx: SetupContext;
  runtime: RestoreRuntime;
  rollback: MaintenanceRollbackArtifacts;
  skipProviderCredentials: boolean;
  localAppBaseUrl: string;
  localMaintenanceAppBaseUrl: string;
  testHooks: PfbackupRestoreTestHooks;
}) {
  try {
    await input.testHooks.beforeWriteEnv?.();
    if (input.testHooks.failWriteEnv) {
      throw new Error('ENV-Schreiben absichtlich fehlgeschlagen (Test).');
    }
    writeEnvRecordAtomically(input.prepared.envPath, input.prepared.restoreEnv);
    if (input.prepared.discardTlsPreparation) {
      removeEnvKeys(input.prepared.envPath, [
        ...TLS_ENV_KEYS,
        ...PROXY_TLS_HOST_PATH_ENV_KEYS,
        ...PROXY_TLS_RUNTIME_ENV_KEYS,
      ]);
      wipeTlsStateRoot(input.ctx.home);
    }
    if (input.prepared.tlsSidecarBytes) {
      unpackTlsSidecarBytes(input.prepared.tlsSidecarBytes, input.ctx.home);
      const envAfterTls = readEnvMap(input.prepared.envPath);
      writeGeneratedTlsCaddyfile(input.ctx.home, readTlsStatus(envAfterTls), envAfterTls);
    }
  } catch (error) {
    throw new RestorePhaseError(RESTORE_PHASES.writeEnv, [
      errorMessage(error, 'Backup-.env konnte nicht geschrieben werden.'),
    ]);
  }
  try {
    writeManagerStateAtomically(input.ctx.home, input.prepared.restoreManagerState);
  } catch (error) {
    throw new RestorePhaseError(RESTORE_PHASES.writeManagerState, [
      errorMessage(error, 'Backup-manager-state.json konnte nicht geschrieben werden.'),
    ]);
  }

  let cutover;
  try {
    const envAfterWrite = readEnvMap(input.prepared.envPath);
    cutover = await runFreshDbSettingsCutover(
      {
        rollbackDir: input.rollback.rollbackDir,
        dbAsideSubdir: 'pre-restore-db',
        runOptions: resolveMaintenanceComposeRunOptions(input.ctx, envAfterWrite),
        envAfterWrite,
        importPayload: input.prepared.settings,
        skipProviderCredentials: input.skipProviderCredentials,
        verifyMismatchMessage:
          'Re-exportierter Settings-Snapshot weicht vom importierten Backup ab.',
        localAppBaseUrl: input.localAppBaseUrl,
        localMaintenanceAppBaseUrl: input.localMaintenanceAppBaseUrl,
      },
      {
        appDataAccess: input.prepared.appDataAccess,
        startAppStack: input.runtime.startAppStack,
        startFullStack: input.runtime.startFullStack,
        waitForMaintenanceApp: input.runtime.waitForMaintenanceApp,
        importSnapshot: input.runtime.importSnapshot,
        exportDbSnapshot: input.runtime.exportDbSnapshot,
        composeStatus: input.runtime.composeStatus,
        runHealthChecks: input.runtime.runHealthChecks,
      },
      {
        beforeStartApp: input.testHooks.beforeStartApp,
        beforeImportSnapshot: input.testHooks.beforeImportSnapshot,
        beforeVerifyExport: input.testHooks.beforeVerifyExport,
        failStartApp: input.testHooks.failStartApp,
        failImportSnapshot: input.testHooks.failImportSnapshot,
        failVerifyExport: input.testHooks.failVerifyExport,
      },
    );
  } catch (error) {
    throw new RestorePhaseError(RESTORE_PHASES.cutover, [
      errorMessage(error, 'Restore-Cutover ist unerwartet fehlgeschlagen.'),
    ]);
  }
  if (!cutover.ok) {
    throw new RestorePhaseError(restorePhaseFromCutover(cutover.failedPhase), cutover.errors);
  }
  return cutover;
}

function restoreFailure(error: unknown, phase: RestorePhase, fallback: string): RestorePhaseError {
  return error instanceof RestorePhaseError
    ? error
    : new RestorePhaseError(phase, [errorMessage(error, fallback)]);
}

async function restartAfterBackupFailure(
  runtime: RestoreRuntime,
  runOptions: ComposeRunOptions,
  error: unknown,
): Promise<string[]> {
  const errors = [errorMessage(error, 'Rollback-Sicherung fehlgeschlagen.')];
  try {
    const restart = await runtime.startFullStack(runOptions);
    if (!restart.ok) {
      errors.push(
        restart.log ||
          'Stack konnte nach fehlgeschlagener Rollback-Sicherung nicht neu gestartet werden.',
      );
    }
  } catch (restartError) {
    errors.push(errorMessage(restartError, 'Stack konnte nicht neu gestartet werden.'));
  }
  return errors;
}

function successfulRestoreResult(
  restoreId: string,
  settings: Record<string, unknown>,
  skipProviderCredentials: boolean,
  cutover: Awaited<ReturnType<typeof commitRestore>>,
): PfbackupRestoreResult {
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
        cutover.importResult.routingMode ??
        (typeof opsSettings?.routingMode === 'string' ? opsSettings.routingMode : null),
      portalEnabled: cutover.importResult.portalEnabled ?? opsSettings?.portalEnabled === true,
      providerCredentialsSkipped:
        cutover.importResult.providerCredentialsSkipped ?? skipProviderCredentials,
      disabledProviderIds: cutover.importResult.disabledProviderIds ?? [],
      compose: cutover.compose,
    },
  };
}

async function applyPreparedRestore(input: {
  restoreId: string;
  prepared: PreparedRestore;
  ctx: SetupContext;
  runtime: RestoreRuntime;
  skipProviderCredentials: boolean;
  localAppBaseUrl: string;
  localMaintenanceAppBaseUrl: string;
  testHooks: PfbackupRestoreTestHooks;
}): Promise<PfbackupRestoreResult> {
  const stop = await input.runtime.stopStack(input.prepared.runOptions);
  if (!stop.ok) {
    return failureResult(
      input.restoreId,
      RESTORE_PHASES.stopStack,
      [stop.log || 'Stack konnte nicht gestoppt werden.'],
      false,
      false,
    );
  }

  let rollback: MaintenanceRollbackArtifacts;
  try {
    rollback = await backupRollbackArtifactsAfterStop(
      input.ctx,
      input.restoreId,
      input.prepared.appDataAccess,
    );
    await input.testHooks.afterBackupRollbackState?.();
  } catch (error) {
    const errors = await restartAfterBackupFailure(input.runtime, input.prepared.runOptions, error);
    return failureResult(input.restoreId, RESTORE_PHASES.backupRollbackState, errors, false, false);
  }

  try {
    const cutover = await commitRestore({ ...input, rollback });
    return successfulRestoreResult(
      input.restoreId,
      input.prepared.settings,
      input.skipProviderCredentials,
      cutover,
    );
  } catch (error) {
    const failure = restoreFailure(error, RESTORE_PHASES.cutover, 'Restore ist fehlgeschlagen.');
    const rollbackResult = await executeRollback({
      ctx: input.ctx,
      rollback,
      appDataAccess: input.prepared.appDataAccess,
      runtime: input.runtime,
      localAppBaseUrl: input.localAppBaseUrl,
      failRollback: input.testHooks.failRollback,
    });
    return failureWithRollback(input.restoreId, failure.phase, failure.errors, rollbackResult);
  }
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
  const runtime = resolveRestoreRuntime(deps);
  try {
    const prepared = await prepareRestore({
      content,
      ctx,
      runtime,
      localMaintenanceAppBaseUrl,
      tlsSidecarBase64: options.tlsSidecarBase64,
    });
    return applyPreparedRestore({
      restoreId,
      prepared,
      ctx,
      runtime,
      skipProviderCredentials,
      localAppBaseUrl,
      localMaintenanceAppBaseUrl,
      testHooks,
    });
  } catch (error) {
    const failure = restoreFailure(
      error,
      RESTORE_PHASES.validateArchive,
      'Restore-Vorbereitung ist fehlgeschlagen.',
    );
    return failureResult(restoreId, failure.phase, failure.errors, false, false);
  }
}

export { createLocalAppDataAccess, type AppDataVolumeAccess };
