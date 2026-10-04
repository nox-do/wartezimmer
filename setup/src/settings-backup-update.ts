import { waitForCompatibleMaintenanceApp } from './settings-format-version.js';
import { syncMaintenanceHostFiles } from './maintenance-files.js';
import { atPhase, needsRollback as operationNeedsRollback } from './operation-journal.js';
import { assertNoTlsOperation } from './tls-operation.js';
import { assertNoRestoreOperation } from './restore-operation.js';
import { assertMaintenancePredecessors } from './maintenance-operation-guard.js';
import { hostMutationLock } from './host-mutation-lock.js';
import { createModuleLogger } from './logger.js';
import {
  assertNoUpdateOperation,
  readUpdateOperation,
  writeUpdateOperation,
  finishUpdateOperation,
  syncUpdateArtifacts,
  updateRollbackDirectory as rollbackDirectory,
  updateStagingDirectory as stagingDirectory,
  type UpdateOperation,
} from './update-operation.js';
import { managerStatePath } from './manager-state.js';
import { durableWrite } from './restricted-operation.js';
import { createRuntimePostcondition, auditRuntimePostcondition } from './runtime-postcondition.js';
import { releasePortalContract, installReleaseProxyContract } from './release-proxy-contract.js';
import { composeExec, recoverRestrictedOperation } from './docker.js';
import { auditRestrictedListeners } from './restricted-listener-probe.js';
import type { PortalProxyContract } from '@praxis-flow/server-shared';
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
  detectDockerPlatform,
  assertPackagePlatform,
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
  PFUPDATE_PROXY_RESTRICTED_COMPOSE_TEMPLATE_FILE,
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

import { assertHostLifecycleAction } from './host-lifecycle-guard.js';
import { requirePackageFileExtension } from './package-file-extension.js';
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

const logger = createModuleLogger('setup.update');

export const UPDATE_PHASES = {
  validatePackage: 'validate_package',
  createSettingsBackup: 'create_settings_backup',
  stagePackage: 'stage_package',
  loadImages: 'load_images',
  stopStack: 'stop_stack',
  backupRollbackState: 'backup_rollback_state',
  installTemplates: 'install_templates',
  prepareProxyContract: 'prepare_proxy_contract',
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
  networkInterfaces?: typeof listNetworkInterfaces;
  validateProxyContract?: typeof composeExec;
  auditProxyContract?: typeof auditRestrictedListeners;
  extractArchive?: typeof extractPfupdateArchive;
  validatePackage?: typeof validateExtractedPfupdate;
  createSettingsBackup?: typeof createPfbackup;
  dockerLoad?: typeof dockerLoadArchive;
  imageExists?: (ref: string) => Promise<boolean>;
  detectDockerPlatform?: typeof detectDockerPlatform;
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
  detectDockerPlatform: typeof detectDockerPlatform;
  inspectImage: (ref: string) => Promise<DockerImageInspection>;
  appDataAccess?: AppDataVolumeAccess;
};

type CutoverRuntime = {
  networkInterfaces: typeof listNetworkInterfaces;
  validateProxyContract: typeof composeExec;
  auditProxyContract: typeof auditRestrictedListeners;
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
  portalContract: PortalProxyContract | null;
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
    detectDockerPlatform: deps.detectDockerPlatform ?? detectDockerPlatform,
    inspectImage: deps.inspectImage ?? inspectDockerImage,
    appDataAccess: deps.appDataAccess,
  };
}

function resolveCutoverRuntime(deps: PfupdateApplyDeps): CutoverRuntime {
  return {
    networkInterfaces: deps.networkInterfaces ?? listNetworkInterfaces,
    validateProxyContract: deps.validateProxyContract ?? composeExec,
    auditProxyContract: deps.auditProxyContract ?? auditRestrictedListeners,
    stopStack: deps.stopStack ?? composeStop,
    startAppStack:
      deps.startAppStack ??
      ((runOptions) => composeUp({ ...runOptions, build: false, services: ['sandbox', 'app'] })),
    startFullStack:
      deps.startFullStack ?? ((runOptions) => composeUp({ ...runOptions, build: false })),
    waitForMaintenanceApp:
      deps.waitForMaintenanceApp ?? ((baseUrl) => waitForCompatibleMaintenanceApp(baseUrl)),
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
    PFUPDATE_PROXY_RESTRICTED_COMPOSE_TEMPLATE_FILE,
  ];
}

function copyFileAtomically(source: string, target: string): void {
  durableWrite(target, fs.readFileSync(source, 'utf8'));
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

  const proxyRestrictedComposeSource = pfupdateTemplatePath(
    stagingDir,
    PFUPDATE_PROXY_RESTRICTED_COMPOSE_TEMPLATE_FILE,
  );
  if (fs.existsSync(proxyRestrictedComposeSource)) {
    copyFileAtomically(
      proxyRestrictedComposeSource,
      path.join(home, PFUPDATE_PROXY_RESTRICTED_COMPOSE_TEMPLATE_FILE),
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
  if (!fs.existsSync(composeTemplatesDir)) throw new Error('UPDATE_TEMPLATES_BACKUP_MISSING');
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
    copyFileAtomically(caddyBackup, caddyTarget);
  }
}

/** A durable terminal marker must never precede the files whose state it confirms. */
function syncUpdateHostFiles(home: string): void {
  syncMaintenanceHostFiles(home, [...composeTemplateFilesForRollback(), 'proxy']);
}

async function backupUpdateRollbackArtifacts(
  ctx: SetupContext,
  updateId: string,
  appDataAccess: AppDataVolumeAccess,
): Promise<UpdateRollbackArtifacts> {
  const rollbackDir = rollbackDirectory(ctx.home, updateId);
  fs.mkdirSync(rollbackDir, { recursive: true, mode: 0o700 });
  const rollback = await captureMaintenanceRollback(ctx, rollbackDir, appDataAccess);
  const composeTemplatesDir = path.join(rollbackDir, 'compose-templates');
  backupComposeTemplates(ctx.home, composeTemplatesDir);
  if (
    !fs.existsSync(path.join(rollbackDir, '.env')) ||
    !fs.existsSync(path.join(rollback.appDataDir, 'praxis-flow.db'))
  ) {
    throw new Error('UPDATE_BACKUP_INCOMPLETE');
  }
  // The regular pre-update backup is retained separately from temporary recovery files.
  syncUpdateArtifacts(rollbackDir, ctx.home);
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
    const expectedPlatform = await input.runtime.detectDockerPlatform();
    if (manifest.imageDigests?.proxy?.platform) {
      assertPackagePlatform(
        manifest.imageDigests.proxy.platform,
        expectedPlatform,
        'PFUPDATE_PLATFORM_MISMATCH',
      );
    }
    const portalContract = releasePortalContract(input.stagingDir, manifest, readEnvMap(envPath));

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
      expectedPlatform,
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
      portalContract,
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

/** One recovery path for caught failures and startup; never resumes the target update. */
export async function recoverUpdateOperation(
  ctx: SetupContext,
  deps: PfupdateApplyDeps = {},
): Promise<{ ok: boolean; errors: string[] }> {
  return hostMutationLock(ctx.home).run('recoverUpdateOperation', async () => {
    assertNoTlsOperation(ctx.home);
    assertNoRestoreOperation(ctx.home);
    assertMaintenancePredecessors(ctx.home);
    const operation = readUpdateOperation(ctx.home); // Unreadable evidence is never overwritten.
    if (!operation) return { ok: true, errors: [] };
    if (operation.phase === 'committed' || operation.phase === 'recovered') {
      finishUpdateOperation(ctx.home, operation);
      return { ok: true, errors: [] };
    }
    const needsRollback = operationNeedsRollback(operation);
    const runtime = resolveCutoverRuntime(deps);
    const localAppBaseUrl = deps.localAppBaseUrl ?? LOCAL_SETUP_APP_BASE_URL;
    const rollbackDir = rollbackDirectory(ctx.home, operation.id);
    const rollback: UpdateRollbackArtifacts = {
      rollbackDir,
      managerStatePath: managerStatePath(ctx.home),
      appDataDir: path.join(rollbackDir, 'app-data'),
      composeTemplatesDir: path.join(rollbackDir, 'compose-templates'),
    };
    let result: { ok: boolean; errors: string[] };
    try {
      if (needsRollback) {
        writeUpdateOperation(ctx.home, atPhase(operation, 'rolling-back'));
        // Do not turn a missing recovery snapshot into an empty database/configuration.
        for (const file of ['.env', 'app-data/praxis-flow.db', 'compose-templates']) {
          if (!fs.existsSync(path.join(rollbackDir, file)))
            throw new Error('UPDATE_BACKUP_INCOMPLETE');
        }
        result = await executeUpdateRollback({
          ctx,
          rollback,
          runtime,
          localAppBaseUrl,
          appDataAccess:
            deps.appDataAccess ??
            createDockerAppDataAccess(ctx.composeProjectName, operation.utilityImage),
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
      if (result.ok) syncUpdateHostFiles(ctx.home);
    } catch (error) {
      result = { ok: false, errors: [errorMessage(error, 'Update-Recovery fehlgeschlagen.')] };
    }
    if (!result.ok) {
      writeUpdateOperation(ctx.home, {
        ...operation,
        phase: 'recovery-failed',
        recovery: needsRollback ? 'rollback' : 'restart',
      });
      logger.error(
        { errors: result.errors, updateId: operation.id },
        'Update-Recovery fehlgeschlagen',
      );
      return result;
    }
    const recovered = atPhase(operation, 'recovered');
    writeUpdateOperation(ctx.home, recovered);
    finishUpdateOperation(ctx.home, recovered);
    return result;
  });
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

  try {
    await installReleaseProxyContract(
      input.ctx.home,
      input.prepared.portalContract,
      envAfterWrite,
      resolveMaintenanceComposeRunOptions(input.ctx, envAfterWrite),
      input.runtime.validateProxyContract,
    );
  } catch (error) {
    throw new UpdatePhaseError(UPDATE_PHASES.prepareProxyContract, [
      errorMessage(error, 'Release-Proxyvertrag konnte nicht vorbereitet werden.'),
    ]);
  }

  const importPayload = {
    ...input.prepared.settings,
    env: mergeConfigRestoreEnv(
      settingsEnv(input.prepared.settings),
      readHostEnvRecord(input.prepared.envPath),
    ),
  };
  const postcondition = createRuntimePostcondition(envAfterWrite, input.prepared.portalContract);
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
  const audit = await auditRuntimePostcondition(postcondition, cutoverResult.compose, {
    auditListeners: input.runtime.auditProxyContract,
  });
  if (!audit.ok) throw new UpdatePhaseError(UPDATE_PHASES.healthCheck, audit.errors);
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

  const currentEnv = readEnvMap(input.prepared.envPath);
  const targetEnv = new Map(
    Object.entries(
      buildUpdateEnv(readHostEnvRecord(input.prepared.envPath), input.prepared.manifest),
    ),
  );
  const bindingError = maintenanceStaffBindingPreflightError({
    currentEnv,
    targetEnv,
    interfaces: input.runtime.networkInterfaces(),
  });
  if (bindingError) {
    return failureResult(input.updateId, phase, [
      `Update vor dem Stack-Stopp gesperrt: ${bindingError}`,
    ]);
  }

  let operation: UpdateOperation = {
    schemaVersion: 1,
    id: input.updateId,
    createdAt: new Date().toISOString(),
    targetVersion: input.prepared.manifest.releaseVersion,
    utilityImage: input.prepared.manifest.images.app,
    phase: 'prepared',
  };
  assertNoUpdateOperation(input.ctx.home);
  writeUpdateOperation(input.ctx.home, operation);
  try {
    const stop = await input.runtime.stopStack(input.prepared.runOptions);
    if (!stop.ok) {
      throw new UpdatePhaseError(phase, [stop.log || 'Stack konnte nicht gestoppt werden.']);
    }
    phase = UPDATE_PHASES.backupRollbackState;
    const rollback = await backupUpdateRollbackArtifacts(
      input.ctx,
      input.updateId,
      input.prepared.appDataAccess,
    );

    operation = { ...operation, phase: 'rollback-ready' };
    writeUpdateOperation(input.ctx.home, operation);
    operation = { ...operation, phase: 'cutover' };
    writeUpdateOperation(input.ctx.home, operation);

    // Rotating this token while the app is running immediately breaks the
    // maintenance API used by backup/restore. Migrate only after the
    // pre-update backup and stack shutdown; rollback already covers .env.
    migrateMaintenanceToken(input.ctx.home);

    const compose = await commitPreparedUpdate({ ...input, rollback });
    syncUpdateHostFiles(input.ctx.home);
    operation = { ...operation, phase: 'committed' };
    writeUpdateOperation(input.ctx.home, operation);
    // Cleanup failure cannot invalidate the durable commit or trigger rollback.
    try {
      finishUpdateOperation(input.ctx.home, operation);
    } catch (error) {
      logger.error({ err: error }, 'Update-Cleanup wird beim Start erneut versucht');
    }
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

    // The durable phase, not the in-memory assignment before a possibly failed
    // journal write, determines which recovery path is actually attempted.
    let rollbackAttempted = false;
    try {
      rollbackAttempted = operationNeedsRollback(readUpdateOperation(input.ctx.home));
    } catch {
      // An unreadable journal cannot prove that rollback was attempted.
    }
    let recovery: { ok: boolean; errors: string[] };
    try {
      recovery = await recoverUpdateOperation(input.ctx, {
        ...input.runtime,
        appDataAccess: input.prepared.appDataAccess,
        localAppBaseUrl: input.localAppBaseUrl,
      });
    } catch (recoveryError) {
      logger.error({ err: recoveryError }, 'Update-Recovery-Abschluss ungeklärt');
      recovery = {
        ok: false,
        errors: ['Update-Recovery-Abschluss ungeklärt. Bitte Setup-Diagnose prüfen.'],
      };
    }
    return failureResult(
      input.updateId,
      failure.phase,
      rollbackAttempted ? failure.errors : [...failure.errors, ...recovery.errors],
      rollbackAttempted ? recovery : undefined,
    );
  }
}

export async function applyPfupdate(
  input: PfupdateApplyInput,
  ctx: SetupContext,
  deps: PfupdateApplyDeps = {},
): Promise<PfupdateApplyResult> {
  return hostMutationLock(ctx.home).run('applyPfupdate', async () => {
    const updateId = createUpdateId(deps.now?.());
    const stagingDir = stagingDirectory(ctx.home, updateId);
    const localMaintenanceAppBaseUrl =
      deps.localMaintenanceAppBaseUrl ?? LOCAL_MAINTENANCE_APP_BASE_URL;
    const localAppBaseUrl = deps.localAppBaseUrl ?? LOCAL_SETUP_APP_BASE_URL;
    const previousVersion = readManagerState(ctx.home).release?.releaseVersion ?? null;

    try {
      assertNoTlsOperation(ctx.home);
      assertNoRestoreOperation(ctx.home);
      assertMaintenancePredecessors(ctx.home);
      assertNoUpdateOperation(ctx.home);
      assertHostLifecycleAction(ctx, 'update');
      await recoverRestrictedOperation({
        projectRoot: ctx.home,
        composeProjectName: ctx.composeProjectName,
      });
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
      try {
        cleanupStaging(stagingDir);
      } catch (error) {
        logger.error({ err: error }, 'Update-Staging konnte nicht entfernt werden');
      }
    }
  });
}
