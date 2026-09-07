import fs from 'node:fs';
import path from 'node:path';
import {
  canRunGatewayCompose,
  composeLogs,
  composePs,
  composeRemoveServices,
  composeRestart,
  composeStop,
  composeUp,
  resolveProductComposeServices,
  detectDocker,
  ensureHomeFolders,
  resolveHomeFolders,
  type ComposeStatus,
} from './docker.js';
import { withExpectedStackRunning } from './stack-health.js';
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
import { listLanIpv4Candidates, listNetworkInterfaces, machineHostname } from './network.js';
import { runConnectionProbes } from './probes.js';
import {
  DEFAULT_GATEWAY_BRIDGE_PORT,
  DEFAULT_PROXY_HTTPS_PORT,
  auditNetworkBindings,
  auditNetworkPrerequisites,
} from './network-bindings.js';
import {
  auditDeliveryImages,
  loadDeliveryImagesFromArchive,
  resolveDeliveryImageConfig,
} from './delivery-images.js';
import { readManagerState, releaseEnvFromManagerState } from './manager-state.js';
import {
  appendSandboxClamAvLogSection,
  fetchSandboxScannerStatus,
  resolveMaxSignatureAgeHours,
  type SandboxScannerStatus,
} from './sandbox-health.js';
import {
  CURRENT_SETTINGS_FORMAT_VERSION,
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
} from './urls.js';
import {
  assertComposeRemoveSucceeded,
  buildProxyEnvUpdates,
  buildProxyStatus,
  ensureProxyImageAvailable,
  findProxyContainer,
  planProxyComposeActions,
  PROXY_IMAGE_ENV_KEY,
  PROXY_RUNTIME_ENV_KEYS,
  ProxyConfigError,
  readProxyConfig,
  resolveCanonicalBaseUrlForProxyPlan,
  resolveProxyConfigForWrite,
  resolveProxyImageRef,
} from './proxy.js';
import { dockerImageExists } from './delivery-images.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import type { SetupContext } from './setup-context.js';
import type { ProxyConfigInput } from '@praxis-flow/server-shared';
import { readTlsStatus, TLS_ENV_KEYS } from './host-tls.js';
import { PROXY_TLS_RUNTIME_ENV_KEYS } from './proxy-tls.js';
import { isTlsPreparationInProgressEnv, tlsPreparationLanIpSyncUpdates } from './tls-env.js';

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

/** Optional hooks for tests (compose / port preflight). */
export type HostWriteRuntimeHooks = {
  composePs?: typeof composePs;
  composeRemoveServices?: typeof composeRemoveServices;
  composeUp?: typeof composeUp;
  auditNetworkPrerequisites?: typeof auditNetworkPrerequisites;
  ensureProxyImageAvailable?: typeof ensureProxyImageAvailable;
};

function requireProxyConfig(env: Map<string, string> | null | undefined) {
  try {
    return readProxyConfig(env);
  } catch (error) {
    if (error instanceof ProxyConfigError) {
      throw new SetupApiValidationError(error.message);
    }
    throw error;
  }
}

function resolveProxyForHostWrite(
  env: Map<string, string> | null | undefined,
  override?: ProxyConfigInput,
) {
  try {
    return resolveProxyConfigForWrite(env, override);
  } catch (error) {
    if (error instanceof ProxyConfigError) {
      throw new SetupApiValidationError(error.message);
    }
    throw error;
  }
}

function mapProxyError(error: unknown): never {
  if (error instanceof ProxyConfigError) {
    throw new SetupApiValidationError(error.message);
  }
  throw error;
}

async function ensureProxyImageForCompose(
  env: Map<string, string>,
  hooks?: HostWriteRuntimeHooks,
): Promise<void> {
  const ensure = hooks?.ensureProxyImageAvailable ?? ensureProxyImageAvailable;
  try {
    await ensure(env);
  } catch (error) {
    mapProxyError(error);
  }
}

function isProxyCurrentlyEnabled(env: Map<string, string>): boolean {
  try {
    return readProxyConfig(env).enabled;
  } catch {
    return false;
  }
}

/**
 * Before enabling proxy: desired HTTP port must be free, or already published by our proxy.
 */
async function assertDesiredProxyHttpPortAvailable(
  input: {
    compose: ComposeStatus | null;
    httpPort: number;
  },
  hooks?: HostWriteRuntimeHooks,
): Promise<void> {
  const audit = hooks?.auditNetworkPrerequisites ?? auditNetworkPrerequisites;
  const checks = await audit({
    compose: input.compose,
    proxyEnabled: true,
    proxyHttpPort: input.httpPort,
    appPublishEnabled: false,
  });
  const failed = checks.find((check) => check.id === 'preflight.proxy-http-port' && !check.ok);
  if (!failed) {
    return;
  }
  throw new SetupApiValidationError(
    failed.detail ? `${failed.message} ${failed.detail}` : failed.message,
  );
}

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
  const runOptions = resolveComposeRunOptions(ctx, envMap);
  return withExpectedStackRunning(await composePs(runOptions), runOptions);
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
      result = await composeRestart({
        ...runOptions,
        services: resolveProductComposeServices(runOptions),
      });
    }
  }

  const compose = withExpectedStackRunning(await composePs(runOptions), runOptions);
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
    mac: candidate.mac,
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
    const runOptions = resolveComposeRunOptions(ctx, envMap);
    return withExpectedStackRunning(await composePs(runOptions), runOptions);
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

/** HTTP reachability probes only make sense when the stack claims to be up. */
function shouldRunConnectionProbes(compose: ComposeStatus | null): boolean {
  return Boolean(compose?.running);
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
  if (docker.daemonRunning && shouldRunConnectionProbes(compose)) {
    probes = await runConnectionProbes({
      localAppBaseUrl: LOCAL_SETUP_APP_BASE_URL,
      lanAppBaseUrl,
    });
  }

  let sandboxScanner: SandboxScannerStatus | null = null;
  if (isSandboxServiceRunning(compose)) {
    sandboxScanner = await fetchSandboxScannerStatus(resolveMaxSignatureAgeHours(envMap));
  }

  let proxyServer: HostRuntimeHealth['proxyServer'] = null;
  if (docker.daemonRunning) {
    try {
      const proxy = readProxyConfig(envMap);
      const container = findProxyContainer(compose);
      const used = proxy.enabled || Boolean(container);
      // Enabled proxy always gets a header tile (even if the image is missing), so a
      // configured-but-broken state is visible. Optional image gate only for leftover containers.
      if (used && (proxy.enabled || (await dockerImageExists(resolveProxyImageRef(envMap))))) {
        proxyServer = { enabled: proxy.enabled, container };
      }
    } catch {
      // Invalid proxy env — omit header tile; full HostStatus surfaces the error path.
    }
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
    proxyServer,
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
  if (includeProbes && docker.daemonRunning && shouldRunConnectionProbes(compose)) {
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
  const proxy = requireProxyConfig(envMap);
  const tls = readTlsStatus(envMap);
  const networkPrerequisites = await auditNetworkPrerequisites({
    compose,
    appPublishEnabled: readBooleanEnv(envMap, 'APP_PUBLISH_PORT', true),
    gatewayEnabled: Boolean(gateway?.enabled),
    gatewayBridgePort: bridgePort,
    proxyEnabled: proxy.enabled,
    proxyHttpPort: proxy.httpPort,
    proxyHttpsPort: readPortEnv(envMap, 'PROXY_HTTPS_PORT', DEFAULT_PROXY_HTTPS_PORT),
    proxyHttpsEnabled:
      proxyModeUsesHttps(envMap.get('PROXY_MODE')?.trim() || 'off') || tls.state !== 'off',
  });

  const deliveryImages = await auditDeliveryImages({
    projectRoot: root,
    envMap,
    docker,
  });
  const settingsFormatVersion = shouldRunConnectionProbes(compose)
    ? await resolveCurrentSettingsFormatVersion()
    : CURRENT_SETTINGS_FORMAT_VERSION;

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
    proxy: buildProxyStatus({
      proxy,
      canonicalBaseUrl: canonicalBaseUrl ?? appBaseUrl,
      compose,
    }),
    tls,
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
  const { proxy } = resolveProxyForHostWrite(env, input.proxy);
  const canonicalBaseUrl = resolveCanonicalBaseUrlForProxyPlan({
    proxy,
    existingCanonical: env?.get('CANONICAL_BASE_URL'),
    previousLanIp,
    nextLanIp: input.lanAppIp.trim(),
    overrideCanonical: input.canonicalBaseUrl,
    tlsPreparationActive: env ? isTlsPreparationInProgressEnv(env) : false,
  });
  const deviceUrls = buildDeviceUrlsFromBaseUrl(canonicalBaseUrl);
  const gateway: GatewayPlan = {
    ...input.gateway,
    portalAppIp: input.portalAppIp?.trim() || input.lanAppIp,
  };
  const gatewayEnv = buildGatewayEnv(gateway, deviceUrls);

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
  hooks?: HostWriteRuntimeHooks,
) {
  const projectRoot = ctx.home;
  const envPathExisting = path.join(projectRoot, '.env');
  const existingBefore = readEnvMap(envPathExisting);
  const preparedStorage = input.folders ? prepareStorageFoldersOnDisk(input.folders) : null;
  const {
    secrets,
    generated: secretsGenerated,
    kept: secretsKept,
  } = resolveSecretsForEnv(existingBefore, {
    preserve: Boolean(input.preserveEnv),
  });
  const releaseEnv = releaseEnvFromManagerState(readManagerState(projectRoot));
  const previousLanIp = pickLanIpFromEnv(existingBefore);
  const { proxy, writeEnv: writeProxyEnv } = resolveProxyForHostWrite(existingBefore, input.proxy);
  // Image always; runtime PROXY_* only when wire omits proxy (else overrides cannot flip enable).
  const preserveExistingKeys = [
    ...(input.preserveEnv
      ? [
          'PRAXIS_FLOW_APP_IMAGE',
          'PRAXIS_FLOW_SANDBOX_IMAGE',
          'PRAXIS_FLOW_GATEWAY_IMAGE',
          ...(preparedStorage ? [] : ['IMPORTS_HOST_PATH', 'EXPORTS_HOST_PATH']),
        ]
      : []),
    PROXY_IMAGE_ENV_KEY,
    ...(writeProxyEnv ? [] : [...PROXY_RUNTIME_ENV_KEYS]),
    ...TLS_ENV_KEYS,
    ...PROXY_TLS_RUNTIME_ENV_KEYS,
  ];
  const proxyWasEnabled = isProxyCurrentlyEnabled(existingBefore);
  const canonicalToWrite = resolveCanonicalBaseUrlForProxyPlan({
    proxy,
    existingCanonical: existingBefore.get('CANONICAL_BASE_URL'),
    previousLanIp,
    nextLanIp: input.lanAppIp.trim(),
    overrideCanonical: input.canonicalBaseUrl,
    tlsPreparationActive: isTlsPreparationInProgressEnv(existingBefore),
  });
  const deviceUrls = buildDeviceUrlsFromBaseUrl(canonicalToWrite);
  const gateway: GatewayPlan = {
    ...input.gateway,
    portalAppIp: input.portalAppIp?.trim() || input.lanAppIp,
  };
  const gatewayEnv = buildGatewayEnv(gateway, deviceUrls);

  const runComposePs = hooks?.composePs ?? composePs;
  const runComposeRemove = hooks?.composeRemoveServices ?? composeRemoveServices;
  const runComposeUp = hooks?.composeUp ?? composeUp;

  const deliveryEarly = Boolean(
    resolveDeliveryImageConfig({ projectRoot, envMap: existingBefore })?.appImage || input.delivery,
  );
  const runOptionsEarly = {
    projectRoot,
    delivery: deliveryEarly,
    composeProjectName: ctx.composeProjectName,
  };

  if (writeProxyEnv && proxy.enabled && !proxyWasEnabled) {
    // Force proxy overlay so a still-running own proxy is visible (not treated as foreign).
    const composeBefore = await runComposePs({ ...runOptionsEarly, withProxy: true });
    await assertDesiredProxyHttpPortAvailable(
      { compose: composeBefore, httpPort: proxy.httpPort },
      hooks,
    );
  }

  if (input.runCompose) {
    if (
      !proxy.enabled &&
      writeProxyEnv &&
      (existingBefore.has('PROXY_ENABLED') ||
        existingBefore.has('PROXY_MODE') ||
        existingBefore.get('APP_BIND_ADDRESS') === '127.0.0.1')
    ) {
      const removed = await runComposeRemove(
        {
          ...runOptionsEarly,
          withProxy: true,
        },
        ['proxy'],
      );
      try {
        assertComposeRemoveSucceeded(removed);
      } catch (error) {
        mapProxyError(error);
      }
    }
  }

  const { envPath, backupPath, keysWritten } = writeEnvFromExample(
    projectRoot,
    {
      practiceDisplayName: input.practiceDisplayName,
      secrets,
      extra: {
        ...releaseEnv,
        ...gatewayEnv,
        ...(writeProxyEnv ? buildProxyEnvUpdates(proxy, existingBefore) : {}),
        SETUP_LAN_APP_IP: input.lanAppIp.trim(),
        CANONICAL_BASE_URL: canonicalToWrite,
        ...tlsPreparationLanIpSyncUpdates(existingBefore, input.lanAppIp.trim()),
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
    const runOptions = {
      projectRoot,
      delivery,
      composeProjectName: ctx.composeProjectName,
    };
    if (proxy.enabled) {
      await ensureProxyImageForCompose(envAfterWrite, hooks);
    }
    compose = await runComposeUp({
      ...runOptions,
      withGateway: input.gateway.enabled,
      withProxy: proxy.enabled,
      build: resolveComposeBuild({ ...input, delivery }),
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
  /** Force proxy image ensure + compose up while proxy stays enabled. */
  repairProxy?: boolean;
  canonicalBaseUrl?: string;
  proxy?: ProxyConfigInput;
};

export async function saveHostNetwork(
  ctx: SetupContext,
  input: SaveHostNetworkInput,
  hooks?: HostWriteRuntimeHooks,
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
  const runComposePs = hooks?.composePs ?? composePs;
  const runComposeRemove = hooks?.composeRemoveServices ?? composeRemoveServices;
  const runComposeUp = hooks?.composeUp ?? composeUp;
  const composeBefore = await runComposePs(runOptions);
  const stackWasRunning = composeBefore.running;
  const repairProxy = Boolean(input.repairProxy);

  const previousLanIp = pickLanIpFromEnv(existing);
  const { proxy, writeEnv: writeProxyEnv } = resolveProxyForHostWrite(existing, input.proxy);
  const proxyWasEnabled = isProxyCurrentlyEnabled(existing);

  if (repairProxy && !proxy.enabled) {
    throw new SetupApiValidationError(
      'Proxy-Wiederherstellung nur möglich, wenn der Proxy aktiviert ist.',
    );
  }

  if ((writeProxyEnv && proxy.enabled && !proxyWasEnabled) || (repairProxy && proxy.enabled)) {
    // Force proxy overlay so a still-running own proxy is visible (not treated as foreign).
    const composeForPortCheck = await runComposePs({ ...runOptions, withProxy: true });
    await assertDesiredProxyHttpPortAvailable(
      { compose: composeForPortCheck, httpPort: proxy.httpPort },
      hooks,
    );
  }

  const canonicalBaseUrl = resolveCanonicalBaseUrlForProxyPlan({
    proxy,
    existingCanonical: existing.get('CANONICAL_BASE_URL'),
    previousLanIp,
    nextLanIp: lanAppIp,
    overrideCanonical: input.canonicalBaseUrl,
    tlsPreparationActive: isTlsPreparationInProgressEnv(existing),
  });
  const deviceUrls = buildDeviceUrlsFromBaseUrl(canonicalBaseUrl);
  const updates: Record<string, string> = {
    SETUP_LAN_APP_IP: lanAppIp,
    CANONICAL_BASE_URL: canonicalBaseUrl,
    ...tlsPreparationLanIpSyncUpdates(existing, lanAppIp),
    ...(writeProxyEnv ? buildProxyEnvUpdates(proxy, existing) : {}),
  };

  if (gateway.enabled) {
    Object.assign(updates, buildGatewayEnv(gateway, deviceUrls));
    const { secrets } = resolveSecretsForEnv(existing, { preserve: true });
    if (!existing.get('OPENNDS_FAS_KEY')?.trim()) {
      updates.OPENNDS_FAS_KEY = secrets.OPENNDS_FAS_KEY;
    }
  }

  let composeRestarted = false;
  let compose: ComposeStatus | null = composeBefore;
  let restartLog: string | null = null;
  let gatewayComposeSkipped = false;

  const restartCompose = Boolean(input.restartCompose) || repairProxy;
  const proxyActions = planProxyComposeActions({
    proxyEnabled: proxy.enabled,
    restartCompose,
    stackWasRunning,
  });
  // Repair must compose-up even when the stack was stopped (missing image/container).
  const shouldComposeUp = proxyActions.composeUp || (repairProxy && proxy.enabled);

  if (proxyActions.removeProxyFirst) {
    // Remove while forcing the overlay — must happen before env drops PROXY_ENABLED
    // for compose file resolution (withProxy: true keeps the overlay either way).
    const removed = await runComposeRemove({ ...runOptions, withProxy: true }, ['proxy']);
    try {
      assertComposeRemoveSucceeded(removed);
    } catch (error) {
      mapProxyError(error);
    }
    restartLog = removed.log || null;
  }

  const backup = backupEnvFile(ctx.home);
  const { keysWritten } = updateEnvKeys(envPath, updates);
  if (!gateway.enabled) {
    const { keysRemoved } = removeEnvKeys(envPath, [...GATEWAY_ENV_KEYS]);
    keysWritten.push(...keysRemoved);
  }

  if (shouldComposeUp) {
    const envAfter = readEnvMap(envPath);
    if (proxy.enabled) {
      await ensureProxyImageForCompose(envAfter, hooks);
    }
    const up = await runComposeUp({
      ...resolveComposeRunOptions(ctx, envAfter),
      build: false,
      withGateway: gateway.enabled,
      withProxy: proxy.enabled,
    });
    composeRestarted = up.ok;
    gatewayComposeSkipped = up.gatewaySkipped;
    restartLog = [restartLog, up.log].filter(Boolean).join('\n') || null;
    compose = await runComposePs({
      ...resolveComposeRunOptions(ctx, envAfter),
      withProxy: proxy.enabled,
    });
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
