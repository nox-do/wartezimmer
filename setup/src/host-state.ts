import fs from 'node:fs';
import path from 'node:path';
import {
  canRunGatewayCompose,
  composeLogs,
  composePs,
  composeRestart,
  composeStop,
  composeUp,
  detectDocker,
  ensureHomeFolders,
  resolveHomeFolders,
  type ComposeStatus,
} from './docker.js';
import {
  backupEnvFile,
  readEnvMap,
  removeEnvKeys,
  updateEnvKeys,
  writeEnvFromExample,
} from './env-file.js';
import { createPfbackup, getPfbackupInfo, validatePfbackupFull } from './settings-backup.js';
import { inspectPfbackup } from './settings-backup-inspect.js';
import { restorePfbackup } from './settings-backup-restore.js';
import { applyPfupdate } from './settings-backup-update.js';
import { inspectPfupdate } from './pfupdate-inspect.js';
import { resolveCurrentSettingsFormatVersion } from './settings-format-version.js';
import {
  normalizeStorageFoldersInput,
  prepareStorageFoldersOnDisk,
  writeStorageFolders,
} from './storage-folders.js';
import {
  listLanIpv4Candidates,
  listNetworkInterfaces,
  defaultGatewayBridgeUrl,
  machineHostname,
} from './network.js';
import { runConnectionProbes } from './probes.js';
import {
  DEFAULT_GATEWAY_BRIDGE_PORT,
  DEFAULT_PROXY_HTTP_PORT,
  DEFAULT_PROXY_HTTPS_PORT,
  auditNetworkBindings,
  auditNetworkPrerequisites,
} from './network-bindings.js';
import {
  auditDeliveryImages,
  loadDeliveryImagesFromArchive,
  resolveDeliveryImageConfig,
  writeDeliveryImageEnvFromState,
} from './delivery-images.js';
import { readManagerState, releaseEnvFromManagerState } from './manager-state.js';
import {
  appendSandboxClamAvLogSection,
  fetchSandboxScannerStatus,
  resolveMaxSignatureAgeHours,
  type SandboxScannerStatus,
} from './sandbox-health.js';
import {
  DEFAULT_STAFF_PIN,
  SETUP_DEFAULT_GATEWAY_INTERFACE,
  SETUP_DEFAULT_GATEWAY_IP,
} from '@praxis-flow/server-shared';
import type {
  ApplySetupOptions,
  ComposeAction,
  DeviceUrls,
  DockerStatus,
  GatewayPlan,
  HostGatewayStatus,
  HostNetworkResult,
  HostNetworkStatus,
  HostRuntimeHealth,
  HostStatusOptions,
  LanCandidate,
  LoadDeliveryImagesResult,
  NormalizedSetupPlanInput,
  ProbeResult,
  ResetStaffPinsResult,
  SetupPlan,
  StorageFoldersInput,
  StorageFoldersResult,
} from '@praxis-flow/server-shared';
import { resolveSecretsForEnv } from './secrets.js';
import { resetStaffPinsInAppDatabase } from './staff-pin-reset.js';
import {
  buildDeviceUrlsFromBaseUrl,
  buildGatewayEnv,
  fallbackCanonicalBaseUrl,
  GATEWAY_ENV_KEYS,
  LOCAL_SETUP_APP_BASE_URL,
  parseHttpBaseUrl,
  resolveCanonicalBaseUrl,
  resolveCanonicalBaseUrlForLanPlan,
} from './urls.js';
import type { SetupContext } from './setup-context.js';
import {
  getRoutingModeCapabilities as readRoutingModeCapabilities,
  setRoutingMode as persistRoutingMode,
} from './routing-mode.js';

export type {
  ApplySetupOptions,
  ComposeAction,
  DeliveryImagesStatus,
  DeviceUrls,
  GatewayPlan,
  HostGatewayStatus,
  HostNetworkStatus,
  HostNetworkResult,
  LanCandidate,
  LoadDeliveryImagesResult,
  NetworkBindingCheck,
  NormalizedSetupPlanInput,
  ResetStaffPinsResult,
  SetupPlan,
  StorageFoldersInput,
  StorageFoldersResult,
} from '@praxis-flow/server-shared';

export type { SandboxScannerStatus } from './sandbox-health.js';

export type { ComposeStatus } from './docker.js';

function resolveComposeRunOptions(ctx: SetupContext, envMap: Map<string, string>) {
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

export async function getComposeStatus(ctx: SetupContext): Promise<ComposeStatus> {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    return { running: false, services: [] };
  }
  const docker = await detectDocker();
  if (!docker.daemonRunning || !docker.composeAvailable) {
    return { running: false, services: [] };
  }
  const envMap = readEnvMap(envPath);
  return composePs(resolveComposeRunOptions(ctx, envMap));
}

export async function runComposeAction(
  ctx: SetupContext,
  action: ComposeAction,
  options?: { build?: boolean },
): Promise<{ ok: boolean; log: string; compose: ComposeStatus }> {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('ENV_MISSING');
  }
  const envMap = readEnvMap(envPath);
  const runOptions = resolveComposeRunOptions(ctx, envMap);

  let result: { ok: boolean; log: string };
  if (action === 'start') {
    const up = await composeUp({
      ...runOptions,
      build: Boolean(options?.build),
    });
    result = { ok: up.ok, log: up.log };
  } else if (action === 'stop') {
    result = await composeStop(runOptions);
  } else {
    const current = await composePs(runOptions);
    if (!current.running) {
      const up = await composeUp({
        ...runOptions,
        build: Boolean(options?.build),
      });
      result = { ok: up.ok, log: up.log };
    } else {
      result = await composeRestart(runOptions);
    }
  }

  const compose = await composePs(runOptions);
  return { ...result, compose };
}

export async function getComposeLogs(
  ctx: SetupContext,
  options?: { service?: string; tail?: number },
): Promise<{ ok: boolean; log: string }> {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: false, log: 'no .env — cannot fetch compose logs' };
  }
  const envMap = readEnvMap(envPath);
  const service = options?.service?.trim();
  const result = await composeLogs({
    ...resolveComposeRunOptions(ctx, envMap),
    service,
    tail: options?.tail,
  });
  if (service === 'sandbox') {
    const log = await appendSandboxClamAvLogSection(result.log, options?.tail);
    return { ...result, log };
  }
  return result;
}

export {
  createPfbackup as backupPf,
  getPfbackupInfo,
  validatePfbackupFull,
  inspectPfbackup,
  restorePfbackup,
  applyPfupdate,
  inspectPfupdate,
};

export async function resetStaffPinsAndRestart(ctx: SetupContext): Promise<ResetStaffPinsResult> {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    return {
      ok: false,
      log: 'Keine .env — Setup zuerst ausführen.',
      defaultPin: DEFAULT_STAFF_PIN,
      databaseUpdated: false,
      compose: { running: false, services: [] },
    };
  }

  const envMap = readEnvMap(envPath);
  const runOptions = resolveComposeRunOptions(ctx, envMap);
  const lines: string[] = [];

  const current = await composePs(runOptions);
  if (current.running) {
    const stop = await composeStop(runOptions);
    if (stop.log) {
      lines.push(stop.log);
    }
    if (!stop.ok) {
      return {
        ok: false,
        log: lines.join('\n') || 'Stack konnte nicht gestoppt werden.',
        defaultPin: DEFAULT_STAFF_PIN,
        databaseUpdated: false,
        compose: await composePs(runOptions),
      };
    }
  }

  const dbReset = await resetStaffPinsInAppDatabase(ctx.composeProjectName);
  lines.push(dbReset.log);
  if (!dbReset.ok) {
    return {
      ok: false,
      log: lines.join('\n'),
      defaultPin: DEFAULT_STAFF_PIN,
      databaseUpdated: false,
      compose: await composePs(runOptions),
    };
  }

  const up = await composeUp({ ...runOptions, build: false });
  if (up.log) {
    lines.push(up.log);
  }
  const compose = await composePs(runOptions);

  return {
    ok: up.ok,
    log: lines.join('\n'),
    defaultPin: DEFAULT_STAFF_PIN,
    databaseUpdated: dbReset.databaseUpdated,
    compose,
  };
}

export function resolveComposeBuild(input: {
  preserveEnv?: boolean;
  delivery?: boolean;
  composeBuild?: boolean;
}): boolean {
  if (input.composeBuild !== undefined) {
    return input.composeBuild;
  }
  if (input.preserveEnv) {
    return false;
  }
  return !input.delivery;
}

export function readGatewayStatusFromEnv(env: Map<string, string>): HostGatewayStatus {
  const gatewayInterface = env.get('GATEWAY_INTERFACE')?.trim();
  const bridgeUrl = env.get('GATEWAY_AUTH_BRIDGE_URL')?.trim();
  const enabled = Boolean(gatewayInterface || bridgeUrl);
  const portalUrl = env.get('APP_PORTAL_URL')?.trim() ?? '';
  let portalAppIp: string | null = null;
  if (portalUrl) {
    try {
      portalAppIp = new URL(portalUrl).hostname;
    } catch {
      portalAppIp = null;
    }
  }
  return {
    enabled,
    gatewayInterface: gatewayInterface || SETUP_DEFAULT_GATEWAY_INTERFACE,
    gatewayIp: env.get('GATEWAY_IP')?.trim() || SETUP_DEFAULT_GATEWAY_IP,
    portalAppIp,
    authBridgeUrl: bridgeUrl || null,
  };
}

export function pickPracticeDisplayNameFromEnv(env: Map<string, string>): string | null {
  const name = env.get('PRACTICE_DISPLAY_NAME')?.trim();
  return name || null;
}

function readBooleanEnv(env: Map<string, string>, key: string, fallback: boolean): boolean {
  const raw = env.get(key)?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function readPortEnv(env: Map<string, string>, key: string, fallback: number): number {
  const parsed = Number.parseInt(env.get(key)?.trim() || String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function proxyModeUsesHttps(mode: string): boolean {
  return mode === 'tls-custom' || mode === 'tls-managed';
}

export function pickLanIpFromEnv(env: Map<string, string>): string | null {
  const setupLan = env.get('SETUP_LAN_APP_IP')?.trim();
  if (setupLan) {
    return setupLan;
  }

  const portal = env.get('APP_PORTAL_URL');
  if (portal) {
    try {
      return new URL(portal).hostname;
    } catch {
      // ignore
    }
  }
  return null;
}

export function isLanIpStale(
  configuredLanIp: string | null,
  currentLanCandidates: LanCandidate[],
): boolean {
  if (!configuredLanIp || configuredLanIp === '127.0.0.1') {
    return false;
  }
  return !currentLanCandidates.some((candidate) => candidate.address === configuredLanIp);
}

export function buildHostNetworkStatus(envMap: Map<string, string>): HostNetworkStatus {
  const configuredLanIp = pickLanIpFromEnv(envMap);
  const currentLanCandidates = listLanIpv4Candidates().map((candidate) => ({
    address: candidate.address,
    interfaceName: candidate.interfaceName,
  }));

  return {
    configuredLanIp,
    currentLanCandidates,
    lanIpStale: isLanIpStale(configuredLanIp, currentLanCandidates),
  };
}

export async function readComposeForHost(
  ctx: SetupContext,
  envExists: boolean,
  docker: DockerStatus,
  envMap: Map<string, string>,
): Promise<ComposeStatus | null> {
  if (!envExists || !docker.daemonRunning || !docker.composeAvailable) {
    return null;
  }
  try {
    return await composePs(resolveComposeRunOptions(ctx, envMap));
  } catch {
    return { running: false, services: [] };
  }
}

function isSandboxServiceRunning(compose: ComposeStatus | null): boolean {
  return (
    compose?.services.some(
      (service) =>
        (service.service || service.name) === 'sandbox' &&
        service.state.toLowerCase().includes('running'),
    ) ?? false
  );
}

export async function getHostRuntimeHealth(ctx: SetupContext): Promise<HostRuntimeHealth> {
  const checkedAt = new Date().toISOString();
  const root = ctx.home;
  const envPath = path.join(root, '.env');
  const envExists = fs.existsSync(envPath);
  const docker = await detectDocker();
  const envMap = envExists ? readEnvMap(envPath) : new Map<string, string>();
  const configuredLanIp = pickLanIpFromEnv(envMap);
  const lanAppBaseUrl = resolveCanonicalBaseUrl(envMap, configuredLanIp) ?? undefined;

  const compose = await readComposeForHost(ctx, envExists, docker, envMap);

  let probes: ProbeResult[] = [];
  if (docker.daemonRunning) {
    probes = await runConnectionProbes({
      localAppBaseUrl: LOCAL_SETUP_APP_BASE_URL,
      lanAppBaseUrl,
    });
  }

  let sandboxScanner: SandboxScannerStatus | null = null;
  if (isSandboxServiceRunning(compose)) {
    sandboxScanner = await fetchSandboxScannerStatus(resolveMaxSignatureAgeHours(envMap));
  }

  return {
    checkedAt,
    envExists,
    configuredLanIp,
    appBaseUrl: lanAppBaseUrl ?? null,
    docker,
    compose,
    probes,
    sandboxScanner,
  };
}

export async function getHostStatus(ctx: SetupContext, options: HostStatusOptions = {}) {
  const includeProbes = options.includeProbes ?? false;
  const includeSandboxScanner = options.includeSandboxScanner ?? false;
  const root = ctx.home;
  const envPath = path.join(root, '.env');
  const envExists = fs.existsSync(envPath);
  const docker = await detectDocker();
  const envMap = envExists ? readEnvMap(envPath) : new Map<string, string>();
  const network = buildHostNetworkStatus(envMap);
  const configuredLanIp = network.configuredLanIp;
  const configuredCanonicalBaseUrl = parseHttpBaseUrl(envMap.get('CANONICAL_BASE_URL'));
  const canonicalBaseUrl = resolveCanonicalBaseUrl(envMap, configuredLanIp);
  const appBaseUrl = canonicalBaseUrl ?? fallbackCanonicalBaseUrl(configuredLanIp ?? '127.0.0.1');
  const deviceUrls: DeviceUrls | null = canonicalBaseUrl
    ? buildDeviceUrlsFromBaseUrl(canonicalBaseUrl)
    : null;
  const folders = resolveHomeFolders(root);

  const compose = await readComposeForHost(ctx, envExists, docker, envMap);

  let probes: ProbeResult[] = [];
  if (includeProbes && docker.daemonRunning) {
    probes = await runConnectionProbes({
      localAppBaseUrl: LOCAL_SETUP_APP_BASE_URL,
      lanAppBaseUrl: canonicalBaseUrl ?? undefined,
    });
  }

  let sandboxScanner: SandboxScannerStatus | null = null;
  if (includeSandboxScanner && isSandboxServiceRunning(compose)) {
    sandboxScanner = await fetchSandboxScannerStatus(resolveMaxSignatureAgeHours(envMap));
  }

  const gateway = envExists ? readGatewayStatusFromEnv(envMap) : null;
  const networkBindings = envExists
    ? await auditNetworkBindings({
        env: envMap,
        compose,
        configuredLanIp: network.configuredLanIp,
        gatewayComposeSupported: canRunGatewayCompose(),
      })
    : [];
  const bridgePort = readPortEnv(envMap, 'GATEWAY_AUTH_BRIDGE_PORT', DEFAULT_GATEWAY_BRIDGE_PORT);
  const proxyEnabled = readBooleanEnv(envMap, 'PROXY_ENABLED', false);
  const proxyMode = envMap.get('PROXY_MODE')?.trim() || 'off';
  const networkPrerequisites = await auditNetworkPrerequisites({
    compose,
    appPublishEnabled: readBooleanEnv(envMap, 'APP_PUBLISH_PORT', true),
    gatewayEnabled: Boolean(gateway?.enabled),
    gatewayBridgePort: bridgePort,
    proxyEnabled,
    proxyHttpPort: readPortEnv(envMap, 'PROXY_HTTP_PORT', DEFAULT_PROXY_HTTP_PORT),
    proxyHttpsPort: readPortEnv(envMap, 'PROXY_HTTPS_PORT', DEFAULT_PROXY_HTTPS_PORT),
    proxyHttpsEnabled: proxyModeUsesHttps(proxyMode),
  });

  const deliveryImages = await auditDeliveryImages({
    projectRoot: root,
    envMap,
    docker,
  });
  const settingsFormatVersion = await resolveCurrentSettingsFormatVersion();

  return {
    installHome: root,
    mode: ctx.mode,
    composeProjectName: ctx.composeProjectName,
    projectRoot: root,
    envExists,
    envPath,
    practiceDisplayName: pickPracticeDisplayNameFromEnv(envMap),
    docker,
    folders,
    appBaseUrl,
    configuredCanonicalBaseUrl,
    network,
    gateway,
    deviceUrls,
    probes,
    compose,
    sandboxScanner,
    networkBindings,
    networkPrerequisites,
    deliveryImages,
    settingsFormatVersion,
  };
}

export function buildSetupPlan(
  input: NormalizedSetupPlanInput,
  env: Map<string, string> | null = null,
): SetupPlan {
  const previousLanIp = env ? pickLanIpFromEnv(env) : null;
  const overrideCanonical = parseHttpBaseUrl(input.canonicalBaseUrl);
  const canonicalBaseUrl =
    overrideCanonical ??
    resolveCanonicalBaseUrlForLanPlan({
      existingCanonical: env?.get('CANONICAL_BASE_URL'),
      previousLanIp,
      nextLanIp: input.lanAppIp.trim(),
    });
  const deviceUrls = buildDeviceUrlsFromBaseUrl(canonicalBaseUrl);
  const gateway: GatewayPlan = {
    ...input.gateway,
    portalAppIp: input.portalAppIp?.trim() || input.lanAppIp,
  };
  const gatewayEnv = buildGatewayEnv(gateway, deviceUrls, defaultGatewayBridgeUrl());

  return {
    deviceUrls,
    gatewayEnv,
    secretsPreview: {
      keys: [
        'AUTH_KEY_CAPTIVE',
        'SANDBOX_INTERNAL_TOKEN',
        ...(gateway.enabled ? ['OPENNDS_FAS_KEY'] : []),
      ],
    },
  };
}

export async function applySetupPlan(
  ctx: SetupContext,
  input: NormalizedSetupPlanInput & ApplySetupOptions,
) {
  const projectRoot = ctx.home;
  const envPathExisting = path.join(projectRoot, '.env');
  const existingBefore = readEnvMap(envPathExisting);
  const preparedStorage = input.folders ? prepareStorageFoldersOnDisk(input.folders) : null;
  const preserveExistingKeys = input.preserveEnv
    ? [
        'PRAXIS_FLOW_APP_IMAGE',
        'PRAXIS_FLOW_SANDBOX_IMAGE',
        'PRAXIS_FLOW_GATEWAY_IMAGE',
        ...(preparedStorage ? [] : ['IMPORTS_HOST_PATH', 'EXPORTS_HOST_PATH']),
      ]
    : undefined;
  const {
    secrets,
    generated: secretsGenerated,
    kept: secretsKept,
  } = resolveSecretsForEnv(existingBefore, {
    preserve: Boolean(input.preserveEnv),
  });
  const releaseEnv = releaseEnvFromManagerState(readManagerState(projectRoot));
  const previousLanIp = pickLanIpFromEnv(existingBefore);
  const overrideCanonical = parseHttpBaseUrl(input.canonicalBaseUrl);
  const canonicalToWrite =
    overrideCanonical ??
    resolveCanonicalBaseUrlForLanPlan({
      existingCanonical: existingBefore.get('CANONICAL_BASE_URL'),
      previousLanIp,
      nextLanIp: input.lanAppIp.trim(),
    });
  const deviceUrls = buildDeviceUrlsFromBaseUrl(canonicalToWrite);
  const gateway: GatewayPlan = {
    ...input.gateway,
    portalAppIp: input.portalAppIp?.trim() || input.lanAppIp,
  };
  const gatewayEnv = buildGatewayEnv(gateway, deviceUrls, defaultGatewayBridgeUrl());
  const { envPath, backupPath, keysWritten } = writeEnvFromExample(
    projectRoot,
    {
      practiceDisplayName: input.practiceDisplayName,
      secrets,
      extra: {
        ...releaseEnv,
        ...gatewayEnv,
        SETUP_LAN_APP_IP: input.lanAppIp.trim(),
        CANONICAL_BASE_URL: canonicalToWrite,
        ...(preparedStorage
          ? {
              IMPORTS_HOST_PATH: preparedStorage.folders.imports,
              EXPORTS_HOST_PATH: preparedStorage.folders.exports,
            }
          : {}),
      },
    },
    {
      preserveExistingKeys,
    },
  );

  let folders: { imports: string; exports: string; created: string[] };
  if (preparedStorage) {
    folders = { ...preparedStorage.folders, created: preparedStorage.created };
  } else {
    folders = ensureHomeFolders(projectRoot);
  }

  const envAfterWrite = readEnvMap(envPath);

  let compose: Awaited<ReturnType<typeof composeUp>> | null = null;
  if (input.runCompose) {
    const delivery = Boolean(
      resolveDeliveryImageConfig({ projectRoot, envMap: envAfterWrite })?.appImage ||
      input.delivery,
    );
    compose = await composeUp({
      projectRoot,
      delivery,
      withGateway: input.gateway.enabled,
      build: resolveComposeBuild({ ...input, delivery }),
      composeProjectName: ctx.composeProjectName,
    });
  }

  const probes =
    input.runProbes !== false && input.runCompose
      ? await runConnectionProbes({
          localAppBaseUrl: LOCAL_SETUP_APP_BASE_URL,
          lanAppBaseUrl: deviceUrls.appBaseUrl,
        })
      : [];

  return {
    envPath,
    backupPath,
    keysWritten,
    folders,
    secretsGenerated,
    secretsKept,
    deviceUrls,
    compose,
    gatewayComposeSkipped: compose?.gatewaySkipped ?? false,
    probes,
  };
}

export function getNetworkSnapshot() {
  return {
    interfaces: listNetworkInterfaces(),
    lanCandidates: listLanIpv4Candidates(),
    machineHostname: machineHostname(),
    defaultGatewayBridgeUrl: defaultGatewayBridgeUrl(),
    gatewayComposeSupported: canRunGatewayCompose(),
  };
}

export type LoadDeliveryImagesInput = {
  archivePath: string;
  restartCompose?: boolean;
};

export async function loadDeliveryImages(
  ctx: SetupContext,
  input: LoadDeliveryImagesInput,
): Promise<LoadDeliveryImagesResult> {
  const docker = await detectDocker();
  const result = await loadDeliveryImagesFromArchive(ctx.home, input.archivePath, docker);
  writeDeliveryImageEnvFromState(ctx.home);

  let composeRestarted = false;
  let compose: ComposeStatus | null = null;
  let restartLog: string | null = null;

  if (input.restartCompose) {
    const envMap = readEnvMap(result.envPath);
    const runOptions = resolveComposeRunOptions(ctx, envMap);
    const up = await composeUp({
      ...runOptions,
      build: false,
    });
    composeRestarted = up.ok;
    restartLog = up.log || null;
    compose = await composePs(runOptions);
  }

  return {
    ...result,
    composeRestarted,
    compose,
    restartLog,
  };
}

export type SaveHostNetworkInput = {
  lanAppIp: string;
  gateway: GatewayPlan;
  restartCompose?: boolean;
  canonicalBaseUrl?: string;
};

export async function saveHostNetwork(
  ctx: SetupContext,
  input: SaveHostNetworkInput,
): Promise<HostNetworkResult> {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('ENV_MISSING');
  }

  const lanAppIp = input.lanAppIp.trim();
  const gateway: GatewayPlan = {
    ...input.gateway,
    portalAppIp: input.gateway.portalAppIp.trim() || lanAppIp,
  };
  const existing = readEnvMap(envPath);
  const runOptions = resolveComposeRunOptions(ctx, existing);
  const composeBefore = await composePs(runOptions);
  const stackWasRunning = composeBefore.running;

  const backup = backupEnvFile(ctx.home);
  const previousLanIp = pickLanIpFromEnv(existing);
  const overrideCanonical = parseHttpBaseUrl(input.canonicalBaseUrl);
  const canonicalBaseUrl =
    overrideCanonical ??
    resolveCanonicalBaseUrlForLanPlan({
      existingCanonical: existing.get('CANONICAL_BASE_URL'),
      previousLanIp,
      nextLanIp: lanAppIp,
    });
  const deviceUrls = buildDeviceUrlsFromBaseUrl(canonicalBaseUrl);
  const updates: Record<string, string> = {
    SETUP_LAN_APP_IP: lanAppIp,
    CANONICAL_BASE_URL: canonicalBaseUrl,
  };

  if (gateway.enabled) {
    Object.assign(updates, buildGatewayEnv(gateway, deviceUrls, defaultGatewayBridgeUrl()));
    const { secrets } = resolveSecretsForEnv(existing, { preserve: true });
    if (!existing.get('OPENNDS_FAS_KEY')?.trim()) {
      updates.OPENNDS_FAS_KEY = secrets.OPENNDS_FAS_KEY;
    }
  }

  const { keysWritten } = updateEnvKeys(envPath, updates);
  if (!gateway.enabled) {
    const { keysRemoved } = removeEnvKeys(envPath, [...GATEWAY_ENV_KEYS]);
    keysWritten.push(...keysRemoved);
  }

  let composeRestarted = false;
  let compose: ComposeStatus | null = composeBefore;
  let restartLog: string | null = null;
  let gatewayComposeSkipped = false;

  if (input.restartCompose && stackWasRunning) {
    const envAfter = readEnvMap(envPath);
    const up = await composeUp({
      ...resolveComposeRunOptions(ctx, envAfter),
      build: false,
      withGateway: gateway.enabled,
    });
    composeRestarted = up.ok;
    gatewayComposeSkipped = up.gatewaySkipped;
    restartLog = up.log || null;
    compose = await composePs(resolveComposeRunOptions(ctx, envAfter));
  }

  return {
    envPath,
    backupPath: backup.backupPath,
    keysWritten,
    deviceUrls,
    gatewayComposeSkipped,
    composeRestarted,
    stackWasRunning,
    compose,
    restartLog,
  };
}

export async function saveStorageFolders(
  ctx: SetupContext,
  input: StorageFoldersInput,
): Promise<StorageFoldersResult> {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('ENV_MISSING');
  }

  const folders = normalizeStorageFoldersInput(input);
  const envMap = readEnvMap(envPath);
  const runOptions = resolveComposeRunOptions(ctx, envMap);
  const composeBefore = await composePs(runOptions);
  const stackWasRunning = composeBefore.running;

  const result = writeStorageFolders(ctx, folders);

  let composeRestarted = false;
  let compose: ComposeStatus | null = composeBefore;
  let restartLog: string | null = null;
  if (input.restartCompose && stackWasRunning) {
    const up = await composeUp({
      ...runOptions,
      build: false,
    });
    composeRestarted = up.ok;
    restartLog = up.log || null;
    compose = await composePs(runOptions);
  }

  return {
    ...result,
    composeRestarted,
    stackWasRunning,
    compose,
    restartLog,
  };
}

export async function getHostRoutingModeCapabilities(ctx: SetupContext) {
  return readRoutingModeCapabilities(ctx.composeProjectName);
}

export async function setHostRoutingMode(
  ctx: SetupContext,
  input: { routingMode: 'simple' | 'complex' },
) {
  return persistRoutingMode(ctx.composeProjectName, input.routingMode);
}
