import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  parsePfbackupArchive,
  validateManagerStateForBackup,
  type ManagerReleaseState,
  type PfupdateApplyInput,
  type PfupdateApplyResult,
  type PfupdateManifestV1,
} from '@praxis-flow/server-shared';
import { createDockerAppDataAccess, type AppDataVolumeAccess } from './app-data-volume.js';
import { composePs, composeStop, composeUp, type ComposeRunOptions } from './docker.js';
import {
  dockerImageExists,
  dockerLoadArchive,
  inspectImagesForHostPlatform,
  inspectDockerImage,
  type DockerImageInspection,
} from './delivery-images.js';
import { readEnvMap, writeEnvRecordAtomically } from './env-file.js';
import { readManagerState, writeManagerStateAtomically } from './manager-state.js';
import {
  extractPfupdateArchive,
  PFUPDATE_COMPOSE_TEMPLATE_FILES,
  PFUPDATE_GATEWAY_COMPOSE_TEMPLATE_FILE,
  PFUPDATE_PROXY_CADDYFILE_RELATIVE,
  PFUPDATE_PROXY_COMPOSE_TEMPLATE_FILE,
  PFUPDATE_PROXY_TLS_COMPOSE_TEMPLATE_FILE,
  pfupdateImagesTarPath,
  pfupdateOuterArchiveSha256,
  pfupdateTemplatePath,
  validateExtractedPfupdate,
} from './pfupdate-package.js';
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
import { copyDeviceAuthorizationsFromAsideViaApp } from './device-authorizations-aside.js';
import { mergeConfigRestoreEnv } from './settings-backup-restore.js';
import { resolveCurrentSettingsFormatVersion } from './settings-format-version.js';
import { migrateMaintenanceToken, type SetupContext } from './setup-context.js';
import { maintenanceRequestHeaders } from './maintenance-auth.js';
import { requirePackageFileExtension } from './package-file-extension.js';
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
  cutover: 'cutover',
} as const;

const PFUPDATE_ENV_EXAMPLE_TEMPLATE_FILE = '.env.example';

export type UpdatePhase = (typeof UPDATE_PHASES)[keyof typeof UPDATE_PHASES];

type UpdateRollbackArtifacts = MaintenanceRollbackArtifacts & {
  composeTemplatesDir: string;
};

export type { PfupdateApplyInput };

export type PfupdateApplyDeps = {
  extractArchive?: typeof extractPfupdateArchive;
  validatePackage?: typeof validateExtractedPfupdate;
  createSettingsBackup?: typeof createPfbackup;
  dockerLoad?: typeof dockerLoadArchive;
  imageExists?: (ref: string) => Promise<boolean>;
  inspectImage?: (ref: string) => Promise<DockerImageInspection>;
  stopStack?: MaintenanceStackRuntime['stopStack'];
  startAppStack?: (
    runOptions: ComposeRunOptions,
  ) => Promise<{ ok: boolean; log: string; gatewaySkipped: boolean }>;
  startFullStack?: MaintenanceStackRuntime['startFullStack'];
  waitForMaintenanceApp?: (localAppBaseUrl: string) => Promise<boolean>;
  validateSettings?: typeof validateSettingsSnapshotWithApp;
  importSnapshot?: typeof importSettingsSnapshotViaApp;
  exportDbSnapshot?: (localAppBaseUrl: string) => Promise<SettingsSnapshotDbFromApp>;
  composeStatus?: MaintenanceStackRuntime['composeStatus'];
  runHealthChecks?: MaintenanceStackRuntime['runHealthChecks'];
  appDataAccess?: AppDataVolumeAccess;
  localAppBaseUrl?: string;
  localMaintenanceAppBaseUrl?: string;
  now?: () => Date;
  resolveSettingsFormatVersion?: typeof resolveCurrentSettingsFormatVersion;
};

type PrepareRuntime = {
  extractArchive: typeof extractPfupdateArchive;
  validatePackage: typeof validateExtractedPfupdate;
  resolveSettingsFormatVersion: typeof resolveCurrentSettingsFormatVersion;
  createSettingsBackup: typeof createPfbackup;
  validateSettings: typeof validateSettingsSnapshotWithApp;
  dockerLoad: typeof dockerLoadArchive;
  imageExists: (ref: string) => Promise<boolean>;
  inspectImage: (ref: string) => Promise<DockerImageInspection>;
  appDataAccess?: AppDataVolumeAccess;
};

type CutoverRuntime = {
  stopStack: MaintenanceStackRuntime['stopStack'];
  startAppStack: NonNullable<PfupdateApplyDeps['startAppStack']>;
  startFullStack: MaintenanceStackRuntime['startFullStack'];
  waitForMaintenanceApp: NonNullable<PfupdateApplyDeps['waitForMaintenanceApp']>;
  importSnapshot: typeof importSettingsSnapshotViaApp;
  exportDbSnapshot: NonNullable<PfupdateApplyDeps['exportDbSnapshot']>;
  composeStatus: MaintenanceStackRuntime['composeStatus'];
  runHealthChecks: MaintenanceStackRuntime['runHealthChecks'];
};

type PreparedUpdate = {
  stagingDir: string;
  manifest: PfupdateManifestV1;
  outerArchiveSha256: string;
  preUpdateBackupPath: string;
  settings: Record<string, unknown>;
  envPath: string;
  runOptions: ComposeRunOptions;
  appDataAccess: AppDataVolumeAccess;
};

class UpdatePhaseError extends Error {
  constructor(
    readonly phase: UpdatePhase,
    readonly errors: string[],
  ) {
    super(errors.join(' '));
  }
}

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
        { headers: maintenanceRequestHeaders(), signal: AbortSignal.timeout(5_000) },
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

function resolvePrepareRuntime(deps: PfupdateApplyDeps): PrepareRuntime {
  return {
    extractArchive: deps.extractArchive ?? extractPfupdateArchive,
    validatePackage: deps.validatePackage ?? validateExtractedPfupdate,
    resolveSettingsFormatVersion:
      deps.resolveSettingsFormatVersion ?? resolveCurrentSettingsFormatVersion,
    createSettingsBackup: deps.createSettingsBackup ?? createPfbackup,
    validateSettings: deps.validateSettings ?? validateSettingsSnapshotWithApp,
    dockerLoad: deps.dockerLoad ?? dockerLoadArchive,
    imageExists: deps.imageExists ?? dockerImageExists,
    inspectImage: deps.inspectImage ?? inspectDockerImage,
    appDataAccess: deps.appDataAccess,
  };
}

function resolveCutoverRuntime(deps: PfupdateApplyDeps): CutoverRuntime {
  return {
    stopStack: deps.stopStack ?? composeStop,
    startAppStack:
      deps.startAppStack ??
      ((runOptions) => composeUp({ ...runOptions, build: false, services: ['sandbox', 'app'] })),
    startFullStack:
      deps.startFullStack ?? ((runOptions) => composeUp({ ...runOptions, build: false })),
    waitForMaintenanceApp:
      deps.waitForMaintenanceApp ?? ((baseUrl) => defaultWaitForMaintenanceApp(baseUrl)),
    importSnapshot: deps.importSnapshot ?? importSettingsSnapshotViaApp,
    exportDbSnapshot:
      deps.exportDbSnapshot ?? ((baseUrl) => fetchSettingsDbSnapshotFromApp(baseUrl)),
    composeStatus: deps.composeStatus ?? composePs,
    runHealthChecks: deps.runHealthChecks ?? runDefaultMaintenanceHealthChecks,
  };
}

function failureResult(
  updateId: string,
  failedPhase: UpdatePhase,
  errors: string[],
  rollback?: { ok: boolean; errors: string[] },
): PfupdateApplyResult {
  return {
    ok: false,
    updateId,
    failedPhase,
    rollbackAttempted: Boolean(rollback),
    rollbackSucceeded: rollback?.ok ?? false,
    errors: rollback
      ? [...errors, ...rollback.errors.map((error) => `Rollback: ${error}`)]
      : errors,
  };
}

function parsePfbackupSettings(content: string): Record<string, unknown> {
  const archive = parsePfbackupArchive(JSON.parse(content));
  const settings = JSON.parse(archive.settingsJson) as Record<string, unknown>;
  const managerValidation = validateManagerStateForBackup(JSON.parse(archive.managerStateJson));
  if (!managerValidation.ok || !managerValidation.state) {
    throw new Error(managerValidation.errors.join(' '));
  }
  return settings;
}

function buildReleaseStateFromManifest(
  manifest: PfupdateManifestV1,
  archiveSha256: string,
  previousGatewayImage?: string | null,
): ManagerReleaseState {
  return {
    releaseVersion: manifest.releaseVersion,
    appImage: manifest.images.app,
    sandboxImage: manifest.images.sandbox,
    gatewayImage:
      manifest.images.gateway !== undefined
        ? manifest.images.gateway
        : (previousGatewayImage ?? null),
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
    ...(manifest.images.gateway ? { PRAXIS_FLOW_GATEWAY_IMAGE: manifest.images.gateway } : {}),
    ...(manifest.images.proxy ? { PRAXIS_FLOW_PROXY_IMAGE: manifest.images.proxy } : {}),
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
    case FRESH_DB_CUTOVER_PHASES.copyDeviceAuthorizations:
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
  const refs = [manifest.images.app, manifest.images.sandbox];
  if (manifest.images.gateway) {
    refs.push(manifest.images.gateway);
  }
  if (manifest.images.proxy) {
    refs.push(manifest.images.proxy);
  }
  for (const ref of refs) {
    if (!(await imageExists(ref))) {
      errors.push(`Docker-Image nicht lokal vorhanden: ${ref}`);
    }
  }
  return errors;
}

function composeTemplateFilesForRollback(): readonly string[] {
  return [
    ...PFUPDATE_COMPOSE_TEMPLATE_FILES,
    PFUPDATE_ENV_EXAMPLE_TEMPLATE_FILE,
    PFUPDATE_GATEWAY_COMPOSE_TEMPLATE_FILE,
    PFUPDATE_PROXY_COMPOSE_TEMPLATE_FILE,
    PFUPDATE_PROXY_TLS_COMPOSE_TEMPLATE_FILE,
  ];
}

function copyFileAtomically(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporaryPath = `${target}.pfupdate-${process.pid}-${Date.now()}`;
  try {
    fs.copyFileSync(source, temporaryPath);
    fs.renameSync(temporaryPath, target);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

const CADDYFILE_WAS_ABSENT_MARKER = 'caddyfile-was-absent';

function backupComposeTemplates(home: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const fileName of composeTemplateFilesForRollback()) {
    const source = path.join(home, fileName);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(targetDir, fileName));
    }
  }

  const caddySource = path.join(home, PFUPDATE_PROXY_CADDYFILE_RELATIVE);
  if (fs.existsSync(caddySource)) {
    const caddyBackup = path.join(targetDir, PFUPDATE_PROXY_CADDYFILE_RELATIVE);
    fs.mkdirSync(path.dirname(caddyBackup), { recursive: true });
    fs.copyFileSync(caddySource, caddyBackup);
  } else {
    fs.writeFileSync(path.join(targetDir, CADDYFILE_WAS_ABSENT_MARKER), '');
  }
}

function installComposeTemplates(stagingDir: string, home: string): void {
  for (const fileName of [...PFUPDATE_COMPOSE_TEMPLATE_FILES, PFUPDATE_ENV_EXAMPLE_TEMPLATE_FILE]) {
    const source = pfupdateTemplatePath(stagingDir, fileName);
    const target = path.join(home, fileName);
    copyFileAtomically(source, target);
  }

  const gatewayComposeSource = pfupdateTemplatePath(
    stagingDir,
    PFUPDATE_GATEWAY_COMPOSE_TEMPLATE_FILE,
  );
  if (fs.existsSync(gatewayComposeSource)) {
    copyFileAtomically(
      gatewayComposeSource,
      path.join(home, PFUPDATE_GATEWAY_COMPOSE_TEMPLATE_FILE),
    );
  }

  const proxyComposeSource = pfupdateTemplatePath(stagingDir, PFUPDATE_PROXY_COMPOSE_TEMPLATE_FILE);
  if (fs.existsSync(proxyComposeSource)) {
    copyFileAtomically(proxyComposeSource, path.join(home, PFUPDATE_PROXY_COMPOSE_TEMPLATE_FILE));
  }

  const proxyTlsComposeSource = pfupdateTemplatePath(
    stagingDir,
    PFUPDATE_PROXY_TLS_COMPOSE_TEMPLATE_FILE,
  );
  if (fs.existsSync(proxyTlsComposeSource)) {
    copyFileAtomically(
      proxyTlsComposeSource,
      path.join(home, PFUPDATE_PROXY_TLS_COMPOSE_TEMPLATE_FILE),
    );
  }

  const caddySource = path.join(stagingDir, 'templates', PFUPDATE_PROXY_CADDYFILE_RELATIVE);
  const caddyTarget = path.join(home, PFUPDATE_PROXY_CADDYFILE_RELATIVE);
  if (fs.existsSync(caddySource) && !fs.existsSync(caddyTarget)) {
    fs.mkdirSync(path.dirname(caddyTarget), { recursive: true });
    fs.copyFileSync(caddySource, caddyTarget);
  }
}

function restoreComposeTemplates(composeTemplatesDir: string, home: string): void {
  if (!fs.existsSync(composeTemplatesDir)) {
    return;
  }
  for (const fileName of composeTemplateFilesForRollback()) {
    const source = path.join(composeTemplatesDir, fileName);
    const target = path.join(home, fileName);
    if (fs.existsSync(source)) {
      copyFileAtomically(source, target);
    } else if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }

  const caddyTarget = path.join(home, PFUPDATE_PROXY_CADDYFILE_RELATIVE);
  const caddyBackup = path.join(composeTemplatesDir, PFUPDATE_PROXY_CADDYFILE_RELATIVE);
  const wasAbsent = fs.existsSync(path.join(composeTemplatesDir, CADDYFILE_WAS_ABSENT_MARKER));
  if (wasAbsent) {
    if (fs.existsSync(caddyTarget)) {
      fs.unlinkSync(caddyTarget);
    }
    const proxyDir = path.dirname(caddyTarget);
    if (fs.existsSync(proxyDir) && fs.readdirSync(proxyDir).length === 0) {
      fs.rmdirSync(proxyDir);
    }
  } else if (fs.existsSync(caddyBackup)) {
    fs.mkdirSync(path.dirname(caddyTarget), { recursive: true });
    fs.copyFileSync(caddyBackup, caddyTarget);
  }
}

async function backupUpdateRollbackArtifacts(
  ctx: SetupContext,
  updateId: string,
  preUpdateBackupPath: string,
  appDataAccess: AppDataVolumeAccess,
): Promise<UpdateRollbackArtifacts> {
  const rollbackDir = rollbackDirectory(ctx.home, updateId);
  const rollback = await captureMaintenanceRollback(ctx, rollbackDir, appDataAccess);
  const composeTemplatesDir = path.join(rollbackDir, 'compose-templates');
  backupComposeTemplates(ctx.home, composeTemplatesDir);
  fs.copyFileSync(preUpdateBackupPath, path.join(rollbackDir, path.basename(preUpdateBackupPath)));
  return { ...rollback, composeTemplatesDir };
}

async function executeUpdateRollback(input: {
  ctx: SetupContext;
  rollback: UpdateRollbackArtifacts;
  appDataAccess: AppDataVolumeAccess;
  runtime: CutoverRuntime;
  localAppBaseUrl: string;
}): Promise<{ ok: boolean; errors: string[] }> {
  return executeMaintenanceRollback({
    ctx: input.ctx,
    rollback: input.rollback,
    appDataAccess: input.appDataAccess,
    runtime: input.runtime,
    localAppBaseUrl: input.localAppBaseUrl,
    failedDbDirName: 'failed-update-db',
    beforeRestore: () =>
      restoreComposeTemplates(input.rollback.composeTemplatesDir, input.ctx.home),
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function requireCompatibleManifest(
  validation: ReturnType<typeof validateExtractedPfupdate>,
): PfupdateManifestV1 {
  if (!validation.ok || !validation.manifest) {
    throw new UpdatePhaseError(UPDATE_PHASES.validatePackage, validation.errors);
  }
  const compatibility = validation.compatibility;
  if (!compatibility || (compatibility.managerCompatible && compatibility.settingsCompatible)) {
    return validation.manifest;
  }
  const fallback = !compatibility.managerCompatible
    ? 'Manager-Version ist für dieses Update-Paket zu alt.'
    : 'Settings-Format wird von diesem Update-Paket nicht unterstützt.';
  throw new UpdatePhaseError(
    UPDATE_PHASES.validatePackage,
    compatibility.warnings.length ? compatibility.warnings : [fallback],
  );
}

async function prepareUpdate(input: {
  applyInput: PfupdateApplyInput;
  ctx: SetupContext;
  stagingDir: string;
  localMaintenanceAppBaseUrl: string;
  runtime: PrepareRuntime;
}): Promise<PreparedUpdate> {
  let phase: UpdatePhase = UPDATE_PHASES.validatePackage;
  try {
    const envPath = path.join(input.ctx.home, '.env');
    if (!fs.existsSync(envPath)) {
      throw new UpdatePhaseError(phase, ['Keine .env — Setup zuerst ausführen.']);
    }
    if (
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(input.applyInput.managerVersion?.trim() ?? '')
    ) {
      throw new UpdatePhaseError(phase, [
        'Gültige Manager-Version ist für das Update erforderlich.',
      ]);
    }

    phase = UPDATE_PHASES.stagePackage;
    const archivePath = input.applyInput.archivePath.trim();
    requirePackageFileExtension(archivePath, '.pfupdate');
    input.runtime.extractArchive(archivePath, input.stagingDir);
    const outerArchiveSha256 = pfupdateOuterArchiveSha256(archivePath);

    phase = UPDATE_PHASES.validatePackage;
    const settingsFormatVersion =
      input.applyInput.settingsFormatVersion ??
      (await input.runtime.resolveSettingsFormatVersion(input.localMaintenanceAppBaseUrl));
    const validation = input.runtime.validatePackage(input.stagingDir, {
      managerVersion: input.applyInput.managerVersion,
      settingsFormatVersion,
    });
    const manifest = requireCompatibleManifest(validation);

    phase = UPDATE_PHASES.createSettingsBackup;
    const backup = await input.runtime.createSettingsBackup(
      input.ctx,
      input.localMaintenanceAppBaseUrl,
    );
    const settings = parsePfbackupSettings(fs.readFileSync(backup.backupPath, 'utf8'));
    const settingsValidation = await input.runtime.validateSettings(
      settings,
      input.localMaintenanceAppBaseUrl,
    );
    if (!settingsValidation.ok) {
      throw new UpdatePhaseError(phase, settingsValidation.errors);
    }

    phase = UPDATE_PHASES.loadImages;
    const load = await input.runtime.dockerLoad(pfupdateImagesTarPath(input.stagingDir));
    if (!load.ok) {
      throw new UpdatePhaseError(phase, [
        load.log || 'Docker-Images konnten nicht geladen werden.',
      ]);
    }
    const imageErrors = await verifyManifestImagesLoaded(manifest, input.runtime.imageExists);
    if (imageErrors.length) {
      throw new UpdatePhaseError(phase, imageErrors);
    }
    const proxyContract = manifest.imageDigests?.proxy;
    const inspectedImages = await inspectImagesForHostPlatform(
      [manifest.images.app, manifest.images.sandbox, manifest.images.proxy!],
      input.runtime.inspectImage,
      'PFUPDATE_PLATFORM_MISMATCH',
    );
    const proxyInspection = inspectedImages.get(manifest.images.proxy!)!;
    if (
      !proxyContract ||
      proxyInspection.imageId !== proxyContract.archiveImageId ||
      proxyInspection.platform !== proxyContract.platform
    ) {
      throw new UpdatePhaseError(phase, [
        'Geladenes Proxy-Image entspricht nicht ID und Plattform aus dem Manifest.',
      ]);
    }

    const envMap = readEnvMap(envPath);
    return {
      stagingDir: input.stagingDir,
      manifest,
      outerArchiveSha256,
      preUpdateBackupPath: backup.backupPath,
      settings,
      envPath,
      runOptions: resolveMaintenanceComposeRunOptions(input.ctx, envMap),
      appDataAccess:
        input.runtime.appDataAccess ??
        createDockerAppDataAccess(input.ctx.composeProjectName, manifest.images.app),
    };
  } catch (error) {
    if (error instanceof UpdatePhaseError) {
      throw error;
    }
    throw new UpdatePhaseError(phase, [
      errorMessage(error, 'Update-Vorbereitung ist fehlgeschlagen.'),
    ]);
  }
}

async function safeUpdateRollback(
  input: Parameters<typeof executeUpdateRollback>[0],
): Promise<{ ok: boolean; errors: string[] }> {
  try {
    return await executeUpdateRollback(input);
  } catch (error) {
    return { ok: false, errors: [errorMessage(error, 'Rollback ist unerwartet fehlgeschlagen.')] };
  }
}

function cleanupStaging(stagingDir: string): void {
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function settingsEnv(settings: Record<string, unknown>): Record<string, string> {
  const env = settings.env;
  return env && typeof env === 'object' && !Array.isArray(env)
    ? (env as Record<string, string>)
    : {};
}

async function commitPreparedUpdate(input: {
  prepared: PreparedUpdate;
  ctx: SetupContext;
  runtime: CutoverRuntime;
  rollback: UpdateRollbackArtifacts;
  localAppBaseUrl: string;
  localMaintenanceAppBaseUrl: string;
}): Promise<Awaited<ReturnType<CutoverRuntime['composeStatus']>>> {
  try {
    installComposeTemplates(input.prepared.stagingDir, input.ctx.home);
  } catch (error) {
    throw new UpdatePhaseError(UPDATE_PHASES.installTemplates, [
      errorMessage(error, 'Compose-Templates konnten nicht installiert werden.'),
    ]);
  }

  let envAfterWrite: Map<string, string>;
  try {
    const previousRelease = readManagerState(input.ctx.home).release;
    const release = buildReleaseStateFromManifest(
      input.prepared.manifest,
      input.prepared.outerArchiveSha256,
      previousRelease?.gatewayImage,
    );
    writeEnvRecordAtomically(
      input.prepared.envPath,
      buildUpdateEnv(readHostEnvRecord(input.prepared.envPath), input.prepared.manifest),
    );
    writeManagerStateAtomically(input.ctx.home, { release });
    envAfterWrite = readEnvMap(input.prepared.envPath);
  } catch (error) {
    throw new UpdatePhaseError(UPDATE_PHASES.writeReleaseState, [
      errorMessage(error, 'Release-State konnte nicht geschrieben werden.'),
    ]);
  }

  const importPayload = {
    ...input.prepared.settings,
    env: mergeConfigRestoreEnv(
      settingsEnv(input.prepared.settings),
      readHostEnvRecord(input.prepared.envPath),
    ),
  };
  let cutoverResult;
  try {
    cutoverResult = await runFreshDbSettingsCutover(
      {
        rollbackDir: input.rollback.rollbackDir,
        dbAsideSubdir: 'pre-update-db',
        runOptions: resolveMaintenanceComposeRunOptions(input.ctx, envAfterWrite),
        envAfterWrite,
        importPayload,
        verifyMismatchMessage: 'Re-exportierter Settings-Snapshot weicht vom Pre-Update-Backup ab.',
        localAppBaseUrl: input.localAppBaseUrl,
        localMaintenanceAppBaseUrl: input.localMaintenanceAppBaseUrl,
        copyDeviceAuthorizations: copyDeviceAuthorizationsFromAsideViaApp,
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
    );
  } catch (error) {
    throw new UpdatePhaseError(UPDATE_PHASES.cutover, [
      errorMessage(error, 'Update-Cutover ist unerwartet fehlgeschlagen.'),
    ]);
  }

  if (!cutoverResult.ok) {
    throw new UpdatePhaseError(
      updatePhaseFromCutover(cutoverResult.failedPhase),
      cutoverResult.errors,
    );
  }
  return cutoverResult.compose;
}

async function applyPreparedUpdate(input: {
  updateId: string;
  previousVersion: string | null;
  prepared: PreparedUpdate;
  ctx: SetupContext;
  runtime: CutoverRuntime;
  localAppBaseUrl: string;
  localMaintenanceAppBaseUrl: string;
}): Promise<PfupdateApplyResult> {
  let phase: UpdatePhase = UPDATE_PHASES.stopStack;
  let stackStopped = false;
  let rollback: UpdateRollbackArtifacts | null = null;

  try {
    const stop = await input.runtime.stopStack(input.prepared.runOptions);
    if (!stop.ok) {
      throw new UpdatePhaseError(phase, [stop.log || 'Stack konnte nicht gestoppt werden.']);
    }
    stackStopped = true;
    phase = UPDATE_PHASES.backupRollbackState;
    rollback = await backupUpdateRollbackArtifacts(
      input.ctx,
      input.updateId,
      input.prepared.preUpdateBackupPath,
      input.prepared.appDataAccess,
    );

    // Rotating this token while the app is running immediately breaks the
    // maintenance API used by backup/restore. Migrate only after the
    // pre-update backup and stack shutdown; rollback already covers .env.
    migrateMaintenanceToken(input.ctx.home);

    const compose = await commitPreparedUpdate({ ...input, rollback });
    return {
      ok: true,
      updateId: input.updateId,
      report: {
        previousVersion: input.previousVersion,
        targetVersion: input.prepared.manifest.releaseVersion,
        backupPath: input.prepared.preUpdateBackupPath,
        compose,
      },
    };
  } catch (error) {
    const failure =
      error instanceof UpdatePhaseError
        ? error
        : new UpdatePhaseError(phase, [errorMessage(error, 'Update ist fehlgeschlagen.')]);

    if (rollback) {
      const rollbackResult = await safeUpdateRollback({
        ctx: input.ctx,
        rollback,
        appDataAccess: input.prepared.appDataAccess,
        runtime: input.runtime,
        localAppBaseUrl: input.localAppBaseUrl,
      });
      return failureResult(input.updateId, failure.phase, failure.errors, rollbackResult);
    }

    const errors = [...failure.errors];
    if (stackStopped) {
      try {
        const restart = await input.runtime.startFullStack(input.prepared.runOptions);
        if (!restart.ok) {
          errors.push(restart.log || 'Stack konnte nicht neu gestartet werden.');
        }
      } catch (restartError) {
        errors.push(errorMessage(restartError, 'Stack konnte nicht neu gestartet werden.'));
      }
    }
    return failureResult(input.updateId, failure.phase, errors);
  }
}

export async function applyPfupdate(
  input: PfupdateApplyInput,
  ctx: SetupContext,
  deps: PfupdateApplyDeps = {},
): Promise<PfupdateApplyResult> {
  const updateId = createUpdateId(deps.now?.());
  const stagingDir = stagingDirectory(ctx.home, updateId);
  const localMaintenanceAppBaseUrl =
    deps.localMaintenanceAppBaseUrl ?? LOCAL_MAINTENANCE_APP_BASE_URL;
  const localAppBaseUrl = deps.localAppBaseUrl ?? LOCAL_SETUP_APP_BASE_URL;
  const previousVersion = readManagerState(ctx.home).release?.releaseVersion ?? null;

  try {
    const prepared = await prepareUpdate({
      applyInput: input,
      ctx,
      stagingDir,
      localMaintenanceAppBaseUrl,
      runtime: resolvePrepareRuntime(deps),
    });
    return await applyPreparedUpdate({
      updateId,
      previousVersion,
      prepared,
      ctx,
      runtime: resolveCutoverRuntime(deps),
      localAppBaseUrl,
      localMaintenanceAppBaseUrl,
    });
  } catch (error) {
    const failure =
      error instanceof UpdatePhaseError
        ? error
        : new UpdatePhaseError(UPDATE_PHASES.validatePackage, [
            errorMessage(error, 'Update-Vorbereitung ist fehlgeschlagen.'),
          ]);
    return failureResult(updateId, failure.phase, failure.errors);
  } finally {
    cleanupStaging(stagingDir);
  }
}
