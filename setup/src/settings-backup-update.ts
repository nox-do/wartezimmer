import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  parsePfbackupArchive,
  validateManagerStateForBackup,
  type ManagerReleaseState,
  type ManagerState,
  type PfupdateApplyResult,
  type PfupdateManifestV1,
} from '@praxis-flow/server-shared';
import {
  createDockerAppDataAccess,
  createLocalAppDataAccess,
  type AppDataVolumeAccess,
} from './app-data-volume.js';
import { composePs, composeStop, composeUp, type ComposeRunOptions } from './docker.js';
import { dockerImageExists, dockerLoadArchive } from './delivery-images.js';
import { readEnvMap, writeEnvRecordAtomically } from './env-file.js';
import {
  MANAGER_STATE_FILE,
  managerStatePath,
  readManagerState,
  writeManagerStateAtomically,
} from './manager-state.js';
import {
  extractPfupdateArchive,
  PFUPDATE_COMPOSE_TEMPLATE_FILES,
  pfupdateImagesTarPath,
  pfupdateOuterArchiveSha256,
  pfupdateTemplatePath,
  validateExtractedPfupdate,
} from './pfupdate-package.js';
import { runConnectionProbes } from './probes.js';
import { createPfbackup } from './settings-backup.js';
import {
  fetchSettingsDbSnapshotFromApp,
  importSettingsSnapshotViaApp,
  validateSettingsSnapshotWithApp,
  type SettingsSnapshotDbFromApp,
} from './settings-backup.js';
import {
  FRESH_DB_CUTOVER_PHASES,
  runFreshDbSettingsCutover,
  type FreshDbCutoverPhase,
} from './fresh-db-settings-cutover.js';
import { mergeConfigRestoreEnv, type PfbackupRestoreDeps } from './settings-backup-restore.js';
import { resolveCurrentSettingsFormatVersion } from './settings-format-version.js';
import type { SetupContext } from './setup-context.js';
import { resolveDeliveryImageConfig } from './delivery-images.js';
import {
  LOCAL_MAINTENANCE_APP_BASE_URL,
  LOCAL_SETUP_APP_BASE_URL,
  resolveCanonicalBaseUrl,
} from './urls.js';

export const UPDATE_PHASES = {
  validatePackage: 'validate_package',
  createSettingsBackup: 'create_settings_backup',
  stagePackage: 'stage_package',
  loadImages: 'load_images',
  stopStack: 'stop_stack',
  backupRollbackState: 'backup_rollback_state',
  installTemplates: 'install_templates',
  writeReleaseState: 'write_release_state',
  moveDatabase: 'move_database',
  startTargetApp: 'start_target_app',
  waitTargetMaintenance: 'wait_target_maintenance',
  importSettings: 'import_settings',
  verifySettings: 'verify_settings',
  startFullStack: 'start_full_stack',
  healthCheck: 'health_check',
  complete: 'complete',
} as const;

export type UpdatePhase = (typeof UPDATE_PHASES)[keyof typeof UPDATE_PHASES];

type UpdateRollbackArtifacts = {
  rollbackDir: string;
  envPath: string;
  managerStatePath: string;
  appDataDir: string;
  dbFilesBackedUp: string[];
  composeTemplatesDir: string;
  preUpdateBackupPath: string;
};

export type PfupdateApplyInput = {
  archivePath: string;
  managerVersion?: string | null;
  settingsFormatVersion?: number | null;
};

export type PfupdateApplyTestHooks = {
  afterBackupRollbackState?: () => void | Promise<void>;
  beforeWriteReleaseState?: () => void | Promise<void>;
  beforeStartApp?: () => void | Promise<void>;
  beforeImportSettings?: () => void | Promise<void>;
  failWriteReleaseState?: boolean;
  failStartApp?: boolean;
  failImportSettings?: boolean;
  failVerifySettings?: boolean;
  failRollback?: boolean;
};

export type PfupdateApplyDeps = {
  extractArchive?: typeof extractPfupdateArchive;
  validatePackage?: typeof validateExtractedPfupdate;
  createSettingsBackup?: typeof createPfbackup;
  dockerLoad?: typeof dockerLoadArchive;
  imageExists?: (ref: string) => Promise<boolean>;
  stopStack?: PfbackupRestoreDeps['stopStack'];
  startAppStack?: PfbackupRestoreDeps['startAppStack'];
  startFullStack?: PfbackupRestoreDeps['startFullStack'];
  waitForMaintenanceApp?: (localAppBaseUrl: string) => Promise<boolean>;
  validateSettings?: typeof validateSettingsSnapshotWithApp;
  importSnapshot?: typeof importSettingsSnapshotViaApp;
  exportDbSnapshot?: (localAppBaseUrl: string) => Promise<SettingsSnapshotDbFromApp>;
  composeStatus?: PfbackupRestoreDeps['composeStatus'];
  runHealthChecks?: PfbackupRestoreDeps['runHealthChecks'];
  appDataAccess?: AppDataVolumeAccess;
  localAppBaseUrl?: string;
  localMaintenanceAppBaseUrl?: string;
  now?: () => Date;
  resolveSettingsFormatVersion?: typeof resolveCurrentSettingsFormatVersion;
};

function createUpdateId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${randomBytes(4).toString('hex')}`;
}

function rollbackDirectory(installHome: string, updateId: string): string {
  return path.join(installHome, 'rollback', 'update', updateId);
}

function stagingDirectory(installHome: string, updateId: string): string {
  return path.join(installHome, 'updates', 'staging', updateId);
}

function hostEnvRecord(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  return Object.fromEntries(readEnvMap(envPath).entries());
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
    try {
      const response = await fetch(
        `${localAppBaseUrl.replace(/\/$/, '')}/api/v1/ops/settings/capabilities`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (response.ok) {
        return true;
      }
    } catch {
      // retry
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

function failureResult(
  updateId: string,
  failedPhase: UpdatePhase,
  errors: string[],
  rollbackAttempted: boolean,
  rollbackSucceeded: boolean,
): PfupdateApplyResult {
  return {
    ok: false,
    updateId,
    failedPhase,
    rollbackAttempted,
    rollbackSucceeded,
    errors,
  };
}

function failureWithRollback(
  updateId: string,
  failedPhase: UpdatePhase,
  originalErrors: string[],
  rollbackResult: { ok: boolean; errors: string[] },
): PfupdateApplyResult {
  return failureResult(
    updateId,
    failedPhase,
    [...originalErrors, ...rollbackResult.errors.map((error) => `Rollback: ${error}`)],
    true,
    rollbackResult.ok,
  );
}

function parsePfbackupContent(content: string): {
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

function buildReleaseStateFromManifest(
  manifest: PfupdateManifestV1,
  archiveSha256: string,
): ManagerReleaseState {
  return {
    releaseVersion: manifest.releaseVersion,
    appImage: manifest.images.app,
    sandboxImage: manifest.images.sandbox,
    gatewayImage: manifest.images.gateway,
    archiveSha256,
  };
}

function buildUpdateEnv(
  currentEnv: Record<string, string>,
  manifest: PfupdateManifestV1,
): Record<string, string> {
  return {
    ...currentEnv,
    PRAXIS_FLOW_APP_IMAGE: manifest.images.app,
    PRAXIS_FLOW_SANDBOX_IMAGE: manifest.images.sandbox,
    PRAXIS_FLOW_GATEWAY_IMAGE: manifest.images.gateway,
  };
}

function updatePhaseFromCutover(phase: FreshDbCutoverPhase): UpdatePhase {
  switch (phase) {
    case FRESH_DB_CUTOVER_PHASES.moveDatabase:
      return UPDATE_PHASES.moveDatabase;
    case FRESH_DB_CUTOVER_PHASES.startApp:
      return UPDATE_PHASES.startTargetApp;
    case FRESH_DB_CUTOVER_PHASES.waitMaintenance:
      return UPDATE_PHASES.waitTargetMaintenance;
    case FRESH_DB_CUTOVER_PHASES.prepareImport:
    case FRESH_DB_CUTOVER_PHASES.importSnapshot:
      return UPDATE_PHASES.importSettings;
    case FRESH_DB_CUTOVER_PHASES.verifyExport:
      return UPDATE_PHASES.verifySettings;
    case FRESH_DB_CUTOVER_PHASES.startFullStack:
      return UPDATE_PHASES.startFullStack;
    case FRESH_DB_CUTOVER_PHASES.healthCheck:
      return UPDATE_PHASES.healthCheck;
  }
}

async function verifyManifestImagesLoaded(
  manifest: PfupdateManifestV1,
  imageExists: (ref: string) => Promise<boolean>,
): Promise<string[]> {
  const errors: string[] = [];
  for (const ref of [manifest.images.app, manifest.images.sandbox, manifest.images.gateway]) {
    if (!(await imageExists(ref))) {
      errors.push(`Docker-Image nicht lokal vorhanden: ${ref}`);
    }
  }
  return errors;
}

function backupComposeTemplates(home: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const fileName of PFUPDATE_COMPOSE_TEMPLATE_FILES) {
    const source = path.join(home, fileName);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(targetDir, fileName));
    }
  }
}

function installComposeTemplates(stagingDir: string, home: string): void {
  for (const fileName of PFUPDATE_COMPOSE_TEMPLATE_FILES) {
    const source = pfupdateTemplatePath(stagingDir, fileName);
    const target = path.join(home, fileName);
    fs.mkdirSync(home, { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function restoreComposeTemplates(composeTemplatesDir: string, home: string): void {
  if (!fs.existsSync(composeTemplatesDir)) {
    return;
  }
  for (const fileName of PFUPDATE_COMPOSE_TEMPLATE_FILES) {
    const source = path.join(composeTemplatesDir, fileName);
    const target = path.join(home, fileName);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, target);
    } else if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }
}

async function backupUpdateRollbackArtifacts(
  ctx: SetupContext,
  updateId: string,
  preUpdateBackupPath: string,
  appDataAccess: AppDataVolumeAccess,
): Promise<UpdateRollbackArtifacts> {
  const rollbackDir = rollbackDirectory(ctx.home, updateId);
  const envPath = path.join(ctx.home, '.env');
  const managerPath = managerStatePath(ctx.home);
  const appDataDir = path.join(rollbackDir, 'app-data');
  const composeTemplatesDir = path.join(rollbackDir, 'compose-templates');
  fs.mkdirSync(rollbackDir, { recursive: true });

  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, path.join(rollbackDir, '.env'));
  }
  if (fs.existsSync(managerPath)) {
    fs.copyFileSync(managerPath, path.join(rollbackDir, MANAGER_STATE_FILE));
  }
  backupComposeTemplates(ctx.home, composeTemplatesDir);
  fs.copyFileSync(preUpdateBackupPath, path.join(rollbackDir, path.basename(preUpdateBackupPath)));

  const dbFilesBackedUp = await appDataAccess.backupDbFiles(appDataDir);
  return {
    rollbackDir,
    envPath,
    managerStatePath: managerPath,
    appDataDir,
    dbFilesBackedUp,
    composeTemplatesDir,
    preUpdateBackupPath,
  };
}

async function executeUpdateRollback(input: {
  ctx: SetupContext;
  rollback: UpdateRollbackArtifacts;
  appDataAccess: AppDataVolumeAccess;
  stopStack: PfupdateApplyDeps['stopStack'];
  startFullStack: PfupdateApplyDeps['startFullStack'];
  composeStatus: PfupdateApplyDeps['composeStatus'];
  localAppBaseUrl: string;
  failRollback?: boolean;
}): Promise<{ ok: boolean; errors: string[] }> {
  if (input.failRollback) {
    return { ok: false, errors: ['Rollback absichtlich fehlgeschlagen (Test).'] };
  }

  const errors: string[] = [];
  const envMap = readEnvMap(path.join(input.ctx.home, '.env'));
  const runOptions = resolveComposeRunOptions(input.ctx, envMap);

  const stop = await input.stopStack!(runOptions);
  if (!stop.ok) {
    errors.push(stop.log || 'Stack konnte für Rollback nicht gestoppt werden.');
  }

  restoreComposeTemplates(input.rollback.composeTemplatesDir, input.ctx.home);

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

  const failedUpdateDir = path.join(input.rollback.rollbackDir, 'failed-update-db');
  try {
    await input.appDataAccess.moveDbAside(failedUpdateDir);
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

function cleanupStaging(stagingDir: string): void {
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

export async function applyPfupdate(
  input: PfupdateApplyInput,
  ctx: SetupContext,
  deps: PfupdateApplyDeps = {},
  testHooks: PfupdateApplyTestHooks = {},
): Promise<PfupdateApplyResult> {
  const updateId = createUpdateId(deps.now?.());
  const localMaintenanceAppBaseUrl =
    deps.localMaintenanceAppBaseUrl ?? LOCAL_MAINTENANCE_APP_BASE_URL;
  const localAppBaseUrl = deps.localAppBaseUrl ?? LOCAL_SETUP_APP_BASE_URL;
  const archivePath = input.archivePath.trim();
  const stagingDir = stagingDirectory(ctx.home, updateId);
  let outerArchiveSha256: string;

  const extractArchive = deps.extractArchive ?? extractPfupdateArchive;
  const validatePackage = deps.validatePackage ?? validateExtractedPfupdate;
  const resolveSettingsFormatVersion =
    deps.resolveSettingsFormatVersion ?? resolveCurrentSettingsFormatVersion;
  const createSettingsBackup = deps.createSettingsBackup ?? createPfbackup;
  const dockerLoad = deps.dockerLoad ?? dockerLoadArchive;
  const imageExists = deps.imageExists ?? dockerImageExists;
  const stopStack = deps.stopStack ?? composeStop;
  const startAppStack =
    deps.startAppStack ??
    (async (runOptions) =>
      composeUp({ ...runOptions, build: false, services: ['sandbox', 'app'] }));
  const startFullStack =
    deps.startFullStack ?? (async (runOptions) => composeUp({ ...runOptions, build: false }));
  const waitForMaintenanceApp =
    deps.waitForMaintenanceApp ?? ((baseUrl: string) => defaultWaitForMaintenanceApp(baseUrl));
  const validateSettings = deps.validateSettings ?? validateSettingsSnapshotWithApp;
  const importSnapshot = deps.importSnapshot ?? importSettingsSnapshotViaApp;
  const exportDbSnapshot =
    deps.exportDbSnapshot ?? ((baseUrl: string) => fetchSettingsDbSnapshotFromApp(baseUrl));
  const composeStatus = deps.composeStatus ?? composePs;
  const runHealthChecks = deps.runHealthChecks ?? defaultRunHealthChecks;

  let rollback: UpdateRollbackArtifacts;
  let preUpdateBackupPath: string | null = null;
  const previousVersion: string | null = readManagerState(ctx.home).release?.releaseVersion ?? null;

  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    return failureResult(
      updateId,
      UPDATE_PHASES.validatePackage,
      ['Keine .env — Setup zuerst ausführen.'],
      false,
      false,
    );
  }

  try {
    extractArchive(archivePath, stagingDir);
    outerArchiveSha256 = pfupdateOuterArchiveSha256(archivePath);
  } catch (error) {
    cleanupStaging(stagingDir);
    return failureResult(
      updateId,
      UPDATE_PHASES.stagePackage,
      [error instanceof Error ? error.message : 'Update-Paket konnte nicht entpackt werden.'],
      false,
      false,
    );
  }

  let packageValidation;
  try {
    const settingsFormatVersion =
      input.settingsFormatVersion ??
      (await resolveSettingsFormatVersion(localMaintenanceAppBaseUrl));

    packageValidation = validatePackage(stagingDir, {
      managerVersion: input.managerVersion ?? undefined,
      settingsFormatVersion,
    });
  } catch (error) {
    cleanupStaging(stagingDir);
    return failureResult(
      updateId,
      UPDATE_PHASES.validatePackage,
      [error instanceof Error ? error.message : 'Update-Paket konnte nicht validiert werden.'],
      false,
      false,
    );
  }

  if (!packageValidation.ok || !packageValidation.manifest) {
    cleanupStaging(stagingDir);
    return failureResult(
      updateId,
      UPDATE_PHASES.validatePackage,
      packageValidation.errors,
      false,
      false,
    );
  }
  const manifest = packageValidation.manifest;

  if (packageValidation.compatibility && !packageValidation.compatibility.managerCompatible) {
    cleanupStaging(stagingDir);
    return failureResult(
      updateId,
      UPDATE_PHASES.validatePackage,
      packageValidation.compatibility.warnings.length
        ? packageValidation.compatibility.warnings
        : ['Manager-Version ist für dieses Update-Paket zu alt.'],
      false,
      false,
    );
  }

  if (packageValidation.compatibility && !packageValidation.compatibility.settingsCompatible) {
    cleanupStaging(stagingDir);
    return failureResult(
      updateId,
      UPDATE_PHASES.validatePackage,
      packageValidation.compatibility.warnings.length
        ? packageValidation.compatibility.warnings
        : ['Settings-Format wird von diesem Update-Paket nicht unterstützt.'],
      false,
      false,
    );
  }

  try {
    const backup = await createSettingsBackup(ctx, localMaintenanceAppBaseUrl);
    preUpdateBackupPath = backup.backupPath;
  } catch (error) {
    cleanupStaging(stagingDir);
    return failureResult(
      updateId,
      UPDATE_PHASES.createSettingsBackup,
      [error instanceof Error ? error.message : 'Pre-Update-Backup fehlgeschlagen.'],
      false,
      false,
    );
  }

  const loadResult = await dockerLoad(pfupdateImagesTarPath(stagingDir));
  if (!loadResult.ok) {
    cleanupStaging(stagingDir);
    return failureResult(
      updateId,
      UPDATE_PHASES.loadImages,
      [loadResult.log || 'Docker-Images konnten nicht geladen werden.'],
      false,
      false,
    );
  }

  const imageErrors = await verifyManifestImagesLoaded(manifest, imageExists);
  if (imageErrors.length > 0) {
    cleanupStaging(stagingDir);
    return failureResult(updateId, UPDATE_PHASES.loadImages, imageErrors, false, false);
  }

  const envMap = readEnvMap(envPath);
  const runOptions = resolveComposeRunOptions(ctx, envMap);
  const utilityImage = manifest.images.app;
  const appDataAccess =
    deps.appDataAccess ?? createDockerAppDataAccess(ctx.composeProjectName, utilityImage);

  const stop = await stopStack(runOptions);
  if (!stop.ok) {
    cleanupStaging(stagingDir);
    return failureResult(
      updateId,
      UPDATE_PHASES.stopStack,
      [stop.log || 'Stack konnte nicht gestoppt werden.'],
      false,
      false,
    );
  }

  try {
    rollback = await backupUpdateRollbackArtifacts(
      ctx,
      updateId,
      preUpdateBackupPath,
      appDataAccess,
    );
    await testHooks.afterBackupRollbackState?.();
  } catch (error) {
    cleanupStaging(stagingDir);
    const restart = await startFullStack(runOptions);
    const errors = [error instanceof Error ? error.message : 'Rollback-Sicherung fehlgeschlagen.'];
    if (!restart.ok) {
      errors.push(
        restart.log ||
          'Stack konnte nach fehlgeschlagener Rollback-Sicherung nicht neu gestartet werden.',
      );
    }
    return failureResult(updateId, UPDATE_PHASES.backupRollbackState, errors, false, false);
  }

  try {
    installComposeTemplates(stagingDir, ctx.home);
  } catch (error) {
    const rollbackResult = await executeUpdateRollback({
      ctx,
      rollback: rollback!,
      appDataAccess,
      stopStack,
      startFullStack,
      composeStatus,
      localAppBaseUrl,
      failRollback: testHooks.failRollback,
    });
    cleanupStaging(stagingDir);
    return failureWithRollback(
      updateId,
      UPDATE_PHASES.installTemplates,
      [
        error instanceof Error
          ? error.message
          : 'Compose-Templates konnten nicht installiert werden.',
      ],
      rollbackResult,
    );
  }

  const releaseState = buildReleaseStateFromManifest(manifest, outerArchiveSha256);
  const updateEnv = buildUpdateEnv(hostEnvRecord(envPath), manifest);
  const updateManagerState: ManagerState = { release: releaseState };

  try {
    await testHooks.beforeWriteReleaseState?.();
    if (testHooks.failWriteReleaseState) {
      throw new Error('Release-State-Schreiben absichtlich fehlgeschlagen (Test).');
    }
    writeEnvRecordAtomically(envPath, updateEnv);
    writeManagerStateAtomically(ctx.home, updateManagerState);
  } catch (error) {
    const rollbackResult = await executeUpdateRollback({
      ctx,
      rollback: rollback!,
      appDataAccess,
      stopStack,
      startFullStack,
      composeStatus,
      localAppBaseUrl,
      failRollback: testHooks.failRollback,
    });
    cleanupStaging(stagingDir);
    return failureWithRollback(
      updateId,
      UPDATE_PHASES.writeReleaseState,
      [error instanceof Error ? error.message : 'Release-State konnte nicht geschrieben werden.'],
      rollbackResult,
    );
  }

  const envAfterWrite = readEnvMap(envPath);
  const runOptionsAfterWrite = resolveComposeRunOptions(ctx, envAfterWrite);

  const cutoverResult = await runFreshDbSettingsCutover(
    {
      rollbackDir: rollback!.rollbackDir,
      dbAsideSubdir: 'pre-update-db',
      runOptions: runOptionsAfterWrite,
      envAfterWrite,
      verifyMismatchMessage: 'Re-exportierter Settings-Snapshot weicht vom Pre-Update-Backup ab.',
      localAppBaseUrl,
      localMaintenanceAppBaseUrl,
      prepareImport: async () => {
        let settings: Record<string, unknown>;
        try {
          const preUpdateContent = fs.readFileSync(preUpdateBackupPath!, 'utf8');
          const parsed = parsePfbackupContent(preUpdateContent);
          settings = parsed.settings;
        } catch (error) {
          return {
            ok: false as const,
            errors: [
              error instanceof Error
                ? error.message
                : 'Pre-Update-Backup konnte nicht gelesen werden.',
            ],
          };
        }

        const settingsValidation = await validateSettings(settings, localMaintenanceAppBaseUrl);
        if (!settingsValidation.ok) {
          return { ok: false as const, errors: settingsValidation.errors };
        }

        const currentEnv = hostEnvRecord(envPath);
        const backupEnv =
          settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
            ? (settings.env as Record<string, string>)
            : {};
        const restoreEnv = mergeConfigRestoreEnv(backupEnv, currentEnv);
        return {
          ok: true as const,
          importPayload: { ...settings, env: restoreEnv },
        };
      },
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
      beforeImportSnapshot: testHooks.beforeImportSettings,
      failStartApp: testHooks.failStartApp,
      failImportSnapshot: testHooks.failImportSettings,
      failVerifyExport: testHooks.failVerifySettings,
    },
  );

  if (!cutoverResult.ok) {
    const rollbackResult = await executeUpdateRollback({
      ctx,
      rollback: rollback!,
      appDataAccess,
      stopStack,
      startFullStack,
      composeStatus,
      localAppBaseUrl,
      failRollback: testHooks.failRollback,
    });
    cleanupStaging(stagingDir);
    return failureWithRollback(
      updateId,
      updatePhaseFromCutover(cutoverResult.failedPhase),
      cutoverResult.errors,
      rollbackResult,
    );
  }

  const { compose } = cutoverResult;

  cleanupStaging(stagingDir);

  return {
    ok: true,
    updateId,
    report: {
      previousVersion,
      targetVersion: manifest.releaseVersion,
      backupPath: preUpdateBackupPath,
      compose,
    },
  };
}

export { createLocalAppDataAccess, type AppDataVolumeAccess };
