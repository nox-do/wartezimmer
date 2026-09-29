import { waitForCompatibleMaintenanceApp } from './settings-format-version.js';
import { atPhase } from './operation-journal.js';
import { assertNoTlsOperation } from './tls-operation.js';
import { createModuleLogger } from './logger.js';
import {
  assertNoMaintenanceOperation,
  assertMaintenancePredecessors,
} from './maintenance-operation-guard.js';
import { hostMutationLock } from './host-mutation-lock.js';
import { managerStatePath } from './manager-state.js';
import {
  assertMaintenanceRollbackComplete,
  syncMaintenanceArtifacts,
  syncMaintenanceHostFiles,
} from './maintenance-files.js';
import {
  readRestoreOperation,
  restoreNeedsRollback,
  writeRestoreOperation,
  finishRestoreOperation,
  restoreRollbackDirectory as rollbackDirectory,
  type RestoreOperation,
} from './restore-operation.js';
import { buildPfbackupTlsInspectSummary } from './tls-backup-sidecar.js';
import { createRuntimePostcondition, auditRuntimePostcondition } from './runtime-postcondition.js';
import { auditRestrictedListeners } from './restricted-listener-probe.js';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  parsePfbackupArchive,
  NON_RESTORABLE_INSTALL_ENV_KEYS,
  currentTlsClaimsHttps,
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
import { readEnvMap, writeEnvRecordAtomically } from './env-file.js';
import { readManagerState, writeManagerStateAtomically } from './manager-state.js';
import {
  FRESH_DB_CUTOVER_PHASES,
  runFreshDbSettingsCutover,
  type FreshDbCutoverPhase,
} from './fresh-db-settings-cutover.js';

import {
  fetchSettingsDbSnapshotFromApp,
  importSettingsSnapshotViaApp,
  validatePfbackupContent,
  validateSettingsSnapshotWithApp,
  type SettingsSnapshotDbFromApp,
} from './settings-backup.js';
import type { SetupContext } from './setup-context.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL, LOCAL_SETUP_APP_BASE_URL } from './urls.js';
import { listNetworkInterfaces } from './network.js';
import { maintenanceStaffBindingPreflightError } from './maintenance-staff-binding.js';
import {
  captureMaintenanceRollback,
  executeMaintenanceRollback,
  readHostEnvRecord,
  resolveMaintenanceComposeRunOptions,
  runDefaultMaintenanceHealthChecks,
  verifyMaintenanceRollback,
  type MaintenanceRollbackArtifacts,
  type MaintenanceStackRuntime,
} from './maintenance-rollback.js';
import { TLS_ENV_KEYS, readTlsStatus } from './host-tls.js';
import {
  PROXY_TLS_HOST_PATH_ENV_KEYS,
  PROXY_TLS_RUNTIME_ENV_KEYS,
  resolveProxyTlsEnvUpdates,
  readInstalledPortalContract,
  writeGeneratedTlsCaddyfile,
} from './proxy-tls.js';
import {
  decodeTlsSidecarBase64,
  unpackTlsSidecarBytes,
  wipeTlsStateRoot,
} from './tls-backup-sidecar.js';
import { RESTRICTED_NETWORK_PERSISTED_KEYS } from './restricted-network.js';
import {
  checkHostLifecycleAction,
  assertTargetHostLifecycleAction,
} from './host-lifecycle-guard.js';
import { assertNoUpdateOperation } from './update-operation.js';

const logger = createModuleLogger('setup.restore');

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
  /** Only the owning install completion may nest a restore. */
  installationOperationId?: string;
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
  networkInterfaces?: typeof listNetworkInterfaces;
  auditProxyContract?: typeof auditRestrictedListeners;
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
  networkInterfaces: typeof listNetworkInterfaces;
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
  const merged = { ...currentEnv, ...backupEnv };
  for (const key of NON_RESTORABLE_INSTALL_ENV_KEYS) {
    const current = currentEnv[key]?.trim();
    if (current) {
      merged[key] = current;
    } else {
      delete merged[key];
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
    case FRESH_DB_CUTOVER_PHASES.copyDeviceAuthorizations:
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
  tlsArchiveBase64?: string;
} {
  const archive = parsePfbackupArchive(JSON.parse(content));
  const settings = JSON.parse(archive.settingsJson) as Record<string, unknown>;
  const managerValidation = validateManagerStateForBackup(JSON.parse(archive.managerStateJson));
  if (!managerValidation.ok || !managerValidation.state) {
    throw new Error(managerValidation.errors.join(' '));
  }
  return {
    settings,
    managerState: managerValidation.state,
    tlsArchiveBase64: archive.tlsArchiveBase64,
  };
}

async function backupRollbackArtifactsAfterStop(
  ctx: SetupContext,
  restoreId: string,
  appDataAccess: AppDataVolumeAccess,
): Promise<MaintenanceRollbackArtifacts> {
  const dir = rollbackDirectory(ctx.home, restoreId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const rollback = await captureMaintenanceRollback(ctx, dir, appDataAccess);
  assertMaintenanceRollbackComplete(dir);
  syncMaintenanceArtifacts(dir, ctx.home);
  return rollback;
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
    networkInterfaces: deps.networkInterfaces ?? listNetworkInterfaces,
    auditProxyContract: deps.auditProxyContract ?? auditRestrictedListeners,
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
      deps.waitForMaintenanceApp ?? ((baseUrl) => waitForCompatibleMaintenanceApp(baseUrl)),
    importSnapshot: deps.importSnapshot ?? importSettingsSnapshotViaApp,
    exportDbSnapshot:
      deps.exportDbSnapshot ?? ((baseUrl) => fetchSettingsDbSnapshotFromApp(baseUrl)),
    composeStatus: deps.composeStatus ?? composePs,
    runHealthChecks: deps.runHealthChecks ?? runDefaultMaintenanceHealthChecks,
    appDataAccess: deps.appDataAccess,
  };
}

function stripTlsPreparationKeys(env: Record<string, string>): void {
  for (const key of [
    ...TLS_ENV_KEYS,
    ...PROXY_TLS_HOST_PATH_ENV_KEYS,
    ...PROXY_TLS_RUNTIME_ENV_KEYS,
  ]) {
    delete env[key];
  }
}

function applyTlsRestorePlan(input: {
  currentEnv: Record<string, string>;
  backupEnv: Record<string, string>;
  restoreEnv: Record<string, string>;
  tlsSidecarBase64: string | undefined;
  installHome: string;
}): {
  restoreEnv: Record<string, string>;
  tlsSidecarBytes: Buffer | null;
  discardTlsPreparation: boolean;
} {
  const tls = buildPfbackupTlsInspectSummary(input.backupEnv, input.tlsSidecarBase64);
  if (tls && !tls.metadataConsistent)
    throw new RestorePhaseError(RESTORE_PHASES.validateArchive, [
      'Die HTTPS-Angaben in der Sicherung passen nicht zusammen.',
    ]);
  if (!tls?.inBackup && currentTlsClaimsHttps(input.currentEnv)) {
    const restoreEnv = { ...input.restoreEnv };
    const keys = new Set([
      'CANONICAL_BASE_URL',
      'SETUP_LAN_APP_IP',
      'PROXY_ENABLED',
      'PROXY_MODE',
      'APP_BIND_ADDRESS',
      ...TLS_ENV_KEYS,
      ...PROXY_TLS_HOST_PATH_ENV_KEYS,
      ...PROXY_TLS_RUNTIME_ENV_KEYS,
      ...RESTRICTED_NETWORK_PERSISTED_KEYS,
    ]);
    for (const key of keys) {
      delete restoreEnv[key];
      if (input.currentEnv[key] !== undefined) restoreEnv[key] = input.currentEnv[key];
    }
    return { restoreEnv, tlsSidecarBytes: null, discardTlsPreparation: false };
  }
  if (!tls) {
    return { restoreEnv: input.restoreEnv, tlsSidecarBytes: null, discardTlsPreparation: false };
  }

  const supported = tlsRestoreSupported({
    archiveValid: true,
    settingsValid: true,
    targetAppReachable: true,
    tlsMetadataConsistent: tls.metadataConsistent,
    tlsClaimsHttps: tls.inBackup,
    payloadPresent: tls.payloadPresent,
    payloadMatches: tls.payloadMatches,
  });
  if (!supported) {
    const blocked = tlsRestoreBlockedCopy({
      tlsMetadataConsistent: tls.metadataConsistent,
      tlsClaimsHttps: tls.inBackup,
      payloadPresent: tls.payloadPresent,
      payloadMatches: tls.payloadMatches,
    });
    throw new RestorePhaseError(RESTORE_PHASES.validateArchive, [
      blocked ?? 'HTTPS-Restore wird nicht unterstützt.',
    ]);
  }

  const sidecarBytes = decodeTlsSidecarBase64(input.tlsSidecarBase64);
  const matchingSidecar = Boolean(tls.payloadPresent && tls.payloadMatches && sidecarBytes);
  if (tls.inBackup && !matchingSidecar) {
    throw new RestorePhaseError(RESTORE_PHASES.validateArchive, [
      tlsRestoreBlockedCopy({
        tlsMetadataConsistent: tls.metadataConsistent,
        tlsClaimsHttps: true,
        payloadPresent: tls.payloadPresent,
        payloadMatches: tls.payloadMatches,
      }) ?? 'Wiederherstellen ohne HTTPS-Daten ist abgelehnt.',
    ]);
  }

  const restoreEnv = { ...input.restoreEnv };
  if (tls.preparedInBackup && !matchingSidecar) {
    stripTlsPreparationKeys(restoreEnv);
    return { restoreEnv, tlsSidecarBytes: null, discardTlsPreparation: true };
  }

  if (matchingSidecar) {
    Object.assign(restoreEnv, resolveProxyTlsEnvUpdates(input.installHome));
    return { restoreEnv, tlsSidecarBytes: sidecarBytes, discardTlsPreparation: false };
  }

  return { restoreEnv, tlsSidecarBytes: null, discardTlsPreparation: false };
}

function removeKeys(record: Record<string, string>, keys: readonly string[]): void {
  for (const key of keys) delete record[key];
}

function buildRestoreTargetEnv(input: {
  backupEnv: Record<string, string>;
  currentEnv: Record<string, string>;
  tlsSidecarBase64: string | undefined;
  installHome: string;
}): ReturnType<typeof applyTlsRestorePlan> {
  const backupProxyMode = input.backupEnv.PROXY_MODE?.trim().toLowerCase();
  if (
    backupProxyMode &&
    backupProxyMode !== 'off' &&
    input.backupEnv.PROXY_ENABLED?.trim().toLowerCase() !== 'true'
  ) {
    throw new RestorePhaseError(RESTORE_PHASES.validateArchive, [
      'Backup-Proxykonfiguration ist unvollständig: PROXY_ENABLED=true fehlt.',
    ]);
  }
  const restoreEnv = mergeConfigRestoreEnv(input.backupEnv, input.currentEnv);
  // Restricted state is a complete backup-owned unit. An absent key in the
  // backup must not inherit an active marker from the current installation.
  removeKeys(restoreEnv, RESTRICTED_NETWORK_PERSISTED_KEYS);
  for (const key of RESTRICTED_NETWORK_PERSISTED_KEYS) {
    const value = input.backupEnv[key];
    if (value !== undefined) restoreEnv[key] = value;
  }
  return applyTlsRestorePlan({ ...input, restoreEnv });
}

async function prepareRestore(input: {
  content: string;
  ctx: SetupContext;
  runtime: RestoreRuntime;
  localMaintenanceAppBaseUrl: string;
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
  const tlsPlan = buildRestoreTargetEnv({
    backupEnv,
    currentEnv: readHostEnvRecord(envPath),
    tlsSidecarBase64: parsed.tlsArchiveBase64,
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
    writeEnvRecordAtomically(input.prepared.envPath, input.prepared.restoreEnv, { replace: true });
    if (input.prepared.discardTlsPreparation) {
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

  const envAfterWrite = readEnvMap(input.prepared.envPath);
  const postcondition = createRuntimePostcondition(
    envAfterWrite,
    readInstalledPortalContract(input.ctx.home),
  );
  let cutover;
  try {
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
  try {
    const audit = await auditRuntimePostcondition(postcondition, cutover.compose, {
      auditListeners: input.runtime.auditProxyContract,
    });
    if (!audit.ok) throw new RestorePhaseError(RESTORE_PHASES.healthCheck, audit.errors);
  } catch (error) {
    throw restoreFailure(
      error,
      RESTORE_PHASES.healthCheck,
      'Restore-Runtime-Audit fehlgeschlagen.',
    );
  }
  return cutover;
}

function restoreFailure(error: unknown, phase: RestorePhase, fallback: string): RestorePhaseError {
  return error instanceof RestorePhaseError
    ? error
    : new RestorePhaseError(phase, [errorMessage(error, fallback)]);
}

/** Repeat the previous-state decision, never the selected backup import. */
export async function recoverRestoreOperation(
  ctx: SetupContext,
  deps: PfbackupRestoreDeps = {},
): Promise<{ ok: boolean; errors: string[] }> {
  return hostMutationLock(ctx.home).run('restore-recovery', async () => {
    const operation = readRestoreOperation(ctx.home);
    if (!operation) return { ok: true, errors: [] };
    if (operation.phase === 'committed' || operation.phase === 'recovered') {
      finishRestoreOperation(ctx.home, operation);
      return { ok: true, errors: [] };
    }
    const rollbackRequired = restoreNeedsRollback(operation);
    const runtime = resolveRestoreRuntime(deps);
    const localAppBaseUrl = deps.localAppBaseUrl ?? LOCAL_SETUP_APP_BASE_URL;
    let result: { ok: boolean; errors: string[] };
    try {
      assertNoTlsOperation(ctx.home);
      assertNoUpdateOperation(ctx.home);
      assertMaintenancePredecessors(ctx.home, operation.installationId);
      if (rollbackRequired) {
        writeRestoreOperation(ctx.home, atPhase(operation, 'rolling-back'));
        const rollbackDir = rollbackDirectory(ctx.home, operation.id);
        assertMaintenanceRollbackComplete(rollbackDir);
        result = await executeMaintenanceRollback({
          ctx,
          runtime,
          localAppBaseUrl,
          rollback: {
            rollbackDir,
            managerStatePath: managerStatePath(ctx.home),
            appDataDir: path.join(rollbackDir, 'app-data'),
          },
          appDataAccess:
            deps.appDataAccess ??
            createDockerAppDataAccess(ctx.composeProjectName, operation.utilityImage ?? ''),
          failedDbDirName: 'failed-restore-db',
        });
      } else {
        const errors: string[] = [];
        await verifyMaintenanceRollback(
          { ctx, runtime, localAppBaseUrl },
          readEnvMap(path.join(ctx.home, '.env')),
          errors,
        );
        result = { ok: errors.length === 0, errors };
      }
      if (result.ok) syncMaintenanceHostFiles(ctx.home);
    } catch (error) {
      result = { ok: false, errors: [errorMessage(error, 'Restore-Recovery fehlgeschlagen.')] };
    }
    if (!result.ok) {
      writeRestoreOperation(ctx.home, {
        ...operation,
        phase: 'recovery-failed',
        recovery: rollbackRequired ? 'rollback' : 'restart',
      });
      logger.error(
        { errors: result.errors, restoreId: operation.id },
        'Restore-Recovery fehlgeschlagen',
      );
      return result;
    }
    const recovered = atPhase(operation, 'recovered');
    writeRestoreOperation(ctx.home, recovered);
    try {
      finishRestoreOperation(ctx.home, recovered);
    } catch (error) {
      logger.error({ err: error }, 'Restore-Cleanup wird beim Start erneut versucht');
    }
    return result;
  });
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
  installationId: string | null;
  prepared: PreparedRestore;
  ctx: SetupContext;
  runtime: RestoreRuntime;
  skipProviderCredentials: boolean;
  localAppBaseUrl: string;
  localMaintenanceAppBaseUrl: string;
  testHooks: PfbackupRestoreTestHooks;
}): Promise<PfbackupRestoreResult> {
  const bindingError = maintenanceStaffBindingPreflightError({
    currentEnv: readEnvMap(input.prepared.envPath),
    targetEnv: new Map(Object.entries(input.prepared.restoreEnv)),
    interfaces: input.runtime.networkInterfaces(),
  });
  if (bindingError) {
    return failureResult(
      input.restoreId,
      RESTORE_PHASES.stopStack,
      [`Restore vor dem Stack-Stopp gesperrt: ${bindingError}`],
      false,
      false,
    );
  }
  assertNoMaintenanceOperation(input.ctx.home);
  assertMaintenancePredecessors(input.ctx.home, input.installationId);
  let operation: RestoreOperation = {
    schemaVersion: 1,
    id: input.restoreId,
    createdAt: new Date().toISOString(),
    utilityImage: readEnvMap(input.prepared.envPath).get('PRAXIS_FLOW_APP_IMAGE')?.trim() || null,
    installationId: input.installationId,
    phase: 'prepared',
  };
  writeRestoreOperation(input.ctx.home, operation);
  let phase: RestorePhase = RESTORE_PHASES.stopStack;
  let completed: Awaited<ReturnType<typeof commitRestore>> | undefined;
  try {
    const stop = await input.runtime.stopStack(input.prepared.runOptions);
    if (!stop.ok)
      throw new RestorePhaseError(phase, [stop.log || 'Stack konnte nicht gestoppt werden.']);
    phase = RESTORE_PHASES.backupRollbackState;
    const rollback = await backupRollbackArtifactsAfterStop(
      input.ctx,
      input.restoreId,
      input.prepared.appDataAccess,
    );
    operation = atPhase(operation, 'rollback-ready');
    writeRestoreOperation(input.ctx.home, operation);
    await input.testHooks.afterBackupRollbackState?.();
    operation = atPhase(operation, 'cutover');
    writeRestoreOperation(input.ctx.home, operation);
    phase = RESTORE_PHASES.cutover;
    completed = await commitRestore({ ...input, rollback });
    syncMaintenanceHostFiles(input.ctx.home);
    operation = atPhase(operation, 'committed');
    writeRestoreOperation(input.ctx.home, operation);
  } catch (error) {
    // Read durable evidence even when a phase write threw after its rename.
    const durable = readRestoreOperation(input.ctx.home);
    if (!(durable?.phase === 'committed' && completed)) {
      const failure = restoreFailure(error, phase, 'Restore ist fehlgeschlagen.');
      const rollbackAttempted = durable ? restoreNeedsRollback(durable) : false;
      let recovery: { ok: boolean; errors: string[] };
      try {
        recovery = await recoverRestoreOperation(input.ctx, {
          ...input.runtime,
          appDataAccess: input.prepared.appDataAccess,
          localAppBaseUrl: input.localAppBaseUrl,
          ...(input.testHooks.failRollback
            ? {
                stopStack: async () => ({
                  ok: false,
                  log: 'Rollback absichtlich fehlgeschlagen (Test).',
                }),
              }
            : {}),
        });
      } catch (recoveryError) {
        logger.error({ err: recoveryError }, 'Restore-Recovery-Abschluss ungeklärt');
        recovery = {
          ok: false,
          errors: ['Restore-Recovery-Abschluss ungeklärt. Bitte Setup-Diagnose prüfen.'],
        };
      }
      return rollbackAttempted
        ? failureWithRollback(input.restoreId, failure.phase, failure.errors, recovery)
        : failureResult(
            input.restoreId,
            failure.phase,
            [...failure.errors, ...recovery.errors],
            false,
            false,
          );
    }
  }
  try {
    finishRestoreOperation(input.ctx.home, operation);
  } catch (error) {
    logger.error({ err: error }, 'Restore-Cleanup wird beim Start erneut versucht');
  }
  return successfulRestoreResult(
    input.restoreId,
    input.prepared.settings,
    input.skipProviderCredentials,
    completed!,
  );
}

export async function restorePfbackup(
  content: string,
  ctx: SetupContext,
  options: PfbackupRestoreOptions = {},
  deps: PfbackupRestoreDeps = {},
  testHooks: PfbackupRestoreTestHooks = {},
): Promise<PfbackupRestoreResult> {
  return hostMutationLock(ctx.home).run('restorePfbackup', async () => {
    const restoreId = createRestoreId(deps.now?.());
    const localMaintenanceAppBaseUrl =
      deps.localMaintenanceAppBaseUrl ?? LOCAL_MAINTENANCE_APP_BASE_URL;
    const localAppBaseUrl = deps.localAppBaseUrl ?? LOCAL_SETUP_APP_BASE_URL;
    const skipProviderCredentials = options.skipProviderCredentials === true;
    const runtime = resolveRestoreRuntime(deps);
    try {
      // Keep the backend entry point safe even when it is called without the HTTP route guard.
      assertNoMaintenanceOperation(ctx.home);
      assertMaintenancePredecessors(ctx.home, options.installationOperationId ?? null);
      const currentLifecycle = checkHostLifecycleAction(ctx, 'restore');
      // A restore has an explicit, fully validated target. It may repair an
      // inconsistent current projection, but never guesses through an unknown
      // installation or a concurrent/unreadable operation.
      if (
        currentLifecycle.lifecycle.assessment === 'unknown' ||
        currentLifecycle.lifecycle.operation !== 'none'
      ) {
        throw new SetupApiValidationError(
          `Host-Aktion „restore“ gesperrt: ${currentLifecycle.reason ?? 'Der aktuelle Lifecycle ist nicht sicher bekannt.'}`,
        );
      }
      const prepared = await prepareRestore({
        content,
        ctx,
        runtime,
        localMaintenanceAppBaseUrl,
      });
      assertTargetHostLifecycleAction(new Map(Object.entries(prepared.restoreEnv)), 'restore');
      return applyPreparedRestore({
        restoreId,
        installationId: options.installationOperationId ?? null,
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
  });
}

export { createLocalAppDataAccess, type AppDataVolumeAccess };
