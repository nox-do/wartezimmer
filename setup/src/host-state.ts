import {
  beginRestrictedOperation,
  releaseRestrictedOperation,
  durableWrite,
  finishRestrictedOperation,
  restrictedOperationEnv,
  restrictedOperationDir,
} from './restricted-operation.js';
import { restoreProxyRestartPolicy, recoverRestrictedOperation } from './docker.js';
import fs from 'node:fs';
import path from 'node:path';
import { Resolver } from 'node:dns/promises';
import {
  canRunGatewayCompose,
  composeLogs,
  composeExec,
  composePs,
  composeRemoveServices,
  composeRestart,
  composeStop,
  composeUp,
  composeValidateConfig,
  resolveProductComposeServices,
  detectDocker,
  ensureHomeFolders,
  resolveHomeFolders,
  type ComposeStatus,
} from './docker.js';
import {
  waitForExpectedStackHealth,
  withExpectedStackRunning,
  type WaitForStackHealthOptions,
} from './stack-health.js';
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
  auditStaffPublishedBindings,
  auditNetworkBindings,
  hostHasLanIp,
} from './network-bindings.js';
import {
  auditDeliveryImages,
  loadDeliveryImagesFromArchive,
  isDeliveryProfile,
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
  NetworkInterfaceInfo,
  ProbeResult,
  RestrictedNetworkInspectResult,
  RestrictedNetworkPrepareInput,
  ResetStaffPinsResult,
  SetupPlan,
  StorageFoldersInput,
  StorageFoldersResult,
  TlsStatus,
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
  resolveAppBindAddress,
} from './proxy.js';
import { dockerImageExists } from './delivery-images.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import type { SetupContext } from './setup-context.js';
import type { ProxyConfigInput } from '@praxis-flow/server-shared';
import { parseTlsDnsResolvers, readTlsStatus, TLS_ENV_KEYS } from './host-tls.js';
import {
  GENERATED_CADDYFILE_MARKER,
  PROXY_TLS_RUNTIME_ENV_KEYS,
  resolveProxyTlsPaths,
  writeGeneratedTlsCaddyfile,
  readInstalledPortalContract,
} from './proxy-tls.js';
import { tlsPreparationLanIpSyncUpdates } from './tls-env.js';
import {
  buildRestrictedNetworkCandidates,
  buildRestrictedNetworkInspect,
  buildRestrictedNetworkStatus,
  RESTRICTED_NETWORK_ENABLED_ENV,
  RESTRICTED_NETWORK_INTERFACE_ID_ENV,
  RESTRICTED_NETWORK_IP_ENV,
  RESTRICTED_NETWORK_PERSISTED_KEYS,
  RESTRICTED_NETWORK_SAME_INTERFACE_CONFIRMED_ENV,
  RESTRICTED_NETWORK_WARNINGS_CONFIRMED_ENV,
  restrictedCertificateCoversHostname,
} from './restricted-network.js';
import { auditRestrictedListeners } from './restricted-listener-probe.js';

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

/** Optional runtime hooks for tests. */
export type HostWriteRuntimeHooks = {
  stackHealthWaitOptions?: WaitForStackHealthOptions;
  composePs?: typeof composePs;
  composeExec?: typeof composeExec;
  composeRemoveServices?: typeof composeRemoveServices;
  composeStop?: typeof composeStop;
  composeUp?: typeof composeUp;
  composeValidateConfig?: typeof composeValidateConfig;
  ensureProxyImageAvailable?: typeof ensureProxyImageAvailable;
  validateStaffIp?: (staffIp: string) => string | null;
  auditStaffBindings?: typeof auditStaffPublishedBindings;
};

function assertStaffIpAvailable(staffIp: string, hooks?: HostWriteRuntimeHooks): void {
  const error = hooks?.validateStaffIp
    ? hooks.validateStaffIp(staffIp)
    : hostHasLanIp(listNetworkInterfaces(), staffIp)
      ? null
      : `Staff-Bindung gesperrt: ${staffIp} ist an diesem Rechner nicht vorhanden.`;
  if (error) {
    throw new SetupApiValidationError(error);
  }
}

/** No Compose mutation has happened when the proxy image preflight fails. */
function restoreEnvAfterPreflightFailure(
  envPath: string,
  backupPath: string | null,
  error: unknown,
  stage = 'Proxy-Image-Prüfung',
): never {
  if (backupPath) {
    fs.copyFileSync(backupPath, envPath);
  } else {
    fs.unlinkSync(envPath);
  }
  throw new SetupApiValidationError(
    `${stage} fehlgeschlagen; vorheriger Env-Zustand wurde wiederhergestellt, die Laufzeit blieb unverändert. ${error instanceof Error ? error.message : String(error)}`,
  );
}

function failedStaffBindingAudit(input: {
  compose: ComposeStatus | null;
  env: Map<string, string>;
  staffIp: string;
  proxyEnabled: boolean;
  hooks?: HostWriteRuntimeHooks;
}): string | null {
  if (!input.proxyEnabled) {
    return null;
  }
  const audit = input.hooks?.auditStaffBindings ?? auditStaffPublishedBindings;
  const proxyMode = input.env.get('PROXY_MODE')?.trim().toLowerCase() || 'off';
  const tlsState = input.env.get('TLS_STATE')?.trim().toLowerCase() || 'off';
  const checks = audit({
    compose: input.compose,
    staffIp: input.staffIp,
    proxyEnabled: input.proxyEnabled,
    proxyHttpPort: readPortEnv(input.env, 'PROXY_HTTP_PORT', 80),
    proxyHttpsEnabled:
      proxyMode === 'tls-managed' || proxyMode === 'tls-custom' || tlsState !== 'off',
    proxyHttpsPort: readPortEnv(input.env, 'PROXY_HTTPS_PORT', 443),
    restrictedIp:
      input.env.get('SETUP_RESTRICTED_ENABLED')?.trim().toLowerCase() === 'true'
        ? input.env.get('SETUP_RESTRICTED_APP_IP')?.trim() || null
        : null,
  });
  const required = new Set([
    'staff.binding.app',
    'staff.binding.sandbox',
    ...(input.proxyEnabled ? ['staff.binding.proxy'] : []),
  ]);
  const failed = checks.find((check) => required.has(check.id) && !check.ok);
  const observed = new Set(
    checks.filter((check) => required.has(check.id)).map((check) => check.id),
  );
  const missing = [...required].find((id) => !observed.has(id));
  if (failed) {
    return failed.detail ? `${failed.message} ${failed.detail}` : failed.message;
  }
  return missing ? `Runtime-Audit unvollständig: ${missing} fehlt.` : null;
}

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

function resolveComposeRunOptions(ctx: SetupContext) {
  return {
    projectRoot: ctx.home,
    delivery: isDeliveryProfile(ctx.home),
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
  const runOptions = resolveComposeRunOptions(ctx);
  return withExpectedStackRunning(await composePs(runOptions), runOptions);
}

export async function runComposeAction(
  ctx: SetupContext,
  action: ComposeAction,
  options?: { build?: boolean },
  hooks?: {
    composeUp?: typeof composeUp;
    composeStop?: typeof composeStop;
    composeRestart?: typeof composeRestart;
    composePs?: typeof composePs;
    auditStaffBindings?: typeof auditStaffPublishedBindings;
  },
): Promise<{ ok: boolean; log: string; compose: ComposeStatus }> {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('ENV_MISSING');
  }
  const envMap = readEnvMap(envPath);
  const runOptions = resolveComposeRunOptions(ctx);
  const runComposeUp = hooks?.composeUp ?? composeUp;
  const runComposeStop = hooks?.composeStop ?? composeStop;
  const runComposeRestart = hooks?.composeRestart ?? composeRestart;
  const runComposePs = hooks?.composePs ?? composePs;

  let result: { ok: boolean; log: string };
  if (action === 'start') {
    const up = await runComposeUp({
      ...runOptions,
      build: Boolean(options?.build),
    });
    result = { ok: up.ok, log: up.log };
  } else if (action === 'stop') {
    result = await runComposeStop(runOptions);
  } else {
    const current = await runComposePs(runOptions);
    if (!current.running) {
      const up = await runComposeUp({
        ...runOptions,
        build: Boolean(options?.build),
      });
      result = { ok: up.ok, log: up.log };
    } else {
      result = await runComposeRestart({
        ...runOptions,
        services: resolveProductComposeServices(runOptions),
      });
    }
  }

  let compose = withExpectedStackRunning(await runComposePs(runOptions), runOptions);
  if (result.ok && action !== 'stop') {
    const proxy = requireProxyConfig(envMap);
    const bindingError = failedStaffBindingAudit({
      compose,
      env: envMap,
      staffIp: envMap.get('SETUP_LAN_APP_IP')?.trim() || '',
      proxyEnabled: proxy.enabled,
      hooks: { auditStaffBindings: hooks?.auditStaffBindings },
    });
    if (bindingError) {
      const stopped = await runComposeStop({
        ...runOptions,
        services: resolveProductComposeServices(runOptions),
      });
      compose = withExpectedStackRunning(await runComposePs(runOptions), runOptions);
      return {
        ok: false,
        log: [
          result.log,
          `Runtime-Bindung unsicher: ${bindingError}`,
          stopped.ok
            ? 'Produktstack wurde vorsorglich gestoppt.'
            : `Produktstack konnte nicht vollständig gestoppt werden: ${stopped.log}`,
        ]
          .filter(Boolean)
          .join('\n'),
        compose,
      };
    }
  }
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
  const service = options?.service?.trim();
  const result = await composeLogs({
    ...resolveComposeRunOptions(ctx),
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

  const runOptions = resolveComposeRunOptions(ctx);
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

function readPortEnv(env: Map<string, string>, key: string, fallback: number): number {
  const parsed = Number.parseInt(env.get(key)?.trim() || String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  _envMap: Map<string, string>,
): Promise<ComposeStatus | null> {
  if (!envExists || !docker.daemonRunning || !docker.composeAvailable) {
    return null;
  }
  try {
    const runOptions = resolveComposeRunOptions(ctx);
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
  const proxy = requireProxyConfig(envMap);
  const tls = readTlsStatus(envMap);
  const restrictedNetwork = buildRestrictedNetworkStatus({
    env: envMap,
    interfaces: listNetworkInterfaces(),
    staffIp: configuredLanIp,
    tls,
    compose,
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
    restrictedNetwork,
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
    // Port availability is determined by Docker when applying the planned publishes.
    networkPrerequisites: [],
    deliveryImages,
    settingsFormatVersion,
  };
}

export async function inspectRestrictedNetwork(ctx: SetupContext, operationId?: string) {
  const envPath = path.join(ctx.home, '.env');
  const envExists = fs.existsSync(envPath);
  const envMap = envExists ? readEnvMap(envPath) : new Map<string, string>();
  const docker = await detectDocker();
  const compose = await readComposeForHost(ctx, envExists, docker, envMap);
  const resolver = new Resolver({ timeout: 2_000, tries: 1 });
  const publicDnsServers = parseTlsDnsResolvers(envMap.get('TLS_DNS_RESOLVERS'));
  const resolvePublic4 = async (hostname: string): Promise<string[]> => {
    const answers = await Promise.all(
      publicDnsServers.map(async (server) => {
        const publicResolver = new Resolver({ timeout: 2_000, tries: 1 });
        publicResolver.setServers([server]);
        return publicResolver.resolve4(hostname).catch((): string[] => []);
      }),
    );
    return [...new Set(answers.flat())];
  };
  const result = await buildRestrictedNetworkInspect({
    env: envMap,
    interfaces: listNetworkInterfaces(),
    staffIp: pickLanIpFromEnv(envMap),
    tls: readTlsStatus(envMap),
    compose,
    resolve4: (hostname) => resolver.resolve4(hostname),
    resolvePublic4,
  });
  if (!operationId && fs.existsSync(restrictedOperationDir(ctx.home))) {
    result.status.health = 'degraded';
    result.checks.push({
      id: 'restricted.pending-operation',
      ok: false,
      message:
        'Restricted-Änderung ist noch nicht abgeschlossen; Start führt eine Wiederherstellung aus.',
    });
  }
  const recoveryFile = path.join(ctx.home, 'state/restricted-recovery.json');
  if (fs.existsSync(recoveryFile)) {
    result.checks.push({
      id: 'restricted.recovered-operation',
      ok: true,
      message:
        'Eine unterbrochene Änderung wurde geschlossen. Patientenzugang bitte erneut prüfen und aktivieren.',
    });
  }
  return result;
}

export async function prepareRestrictedNetwork(
  ctx: SetupContext,
  input: RestrictedNetworkPrepareInput,
  deps: {
    interfaces?: NetworkInterfaceInfo[];
    platform?: string;
    tls?: TlsStatus;
    inspect?: () => Promise<RestrictedNetworkInspectResult>;
  } = {},
) {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    throw new SetupApiValidationError('Setup muss vor dem Patientenzugang abgeschlossen sein.');
  }
  const envMap = readEnvMap(envPath);
  if (envMap.get(RESTRICTED_NETWORK_ENABLED_ENV)?.trim().toLowerCase() === 'true') {
    throw new SetupApiValidationError(
      'Aktiven Patientenzugang zuerst entfernen, bevor die Netzwerkadresse geändert wird.',
    );
  }
  const staffIp = pickLanIpFromEnv(envMap);
  const interfaces = deps.interfaces ?? listNetworkInterfaces();
  const candidates = buildRestrictedNetworkCandidates(interfaces, staffIp);
  const candidate = candidates.find(
    (item) => item.address === input.hostIp && item.interfaceId === input.interfaceId,
  );
  if (!candidate) {
    throw new SetupApiValidationError(
      'Die gewählte Restricted-IP ist nicht mehr lokal verfügbar oder nicht eindeutig zugeordnet.',
    );
  }
  if (candidate.warnings.includes('ambiguous-address')) {
    throw new SetupApiValidationError(
      'Die gewählte Restricted-IP ist mehreren Interfaces zugeordnet und kann nicht eindeutig gebunden werden.',
    );
  }
  if (candidate.warnings.length > 0 && !input.warningsConfirmed) {
    throw new SetupApiValidationError(
      'Die Hinweise zur gewählten Netzwerkadresse müssen bestätigt werden.',
    );
  }
  if ((deps.platform ?? process.platform) !== 'darwin') {
    throw new SetupApiValidationError(
      'Restricted-Binding ist auf dieser Hostplattform noch nicht freigegeben.',
    );
  }
  const tls = deps.tls ?? readTlsStatus(envMap);
  if (tls.mode !== 'managed' || !tls.wildcardCertificateName) {
    throw new SetupApiValidationError(
      'Der dedizierte Patientenzugang ist derzeit nur mit verwaltetem Wildcard-HTTPS verfügbar.',
    );
  }
  const portalHostname = tls.portalHostname?.trim() || '';
  const portalCovered = restrictedCertificateCoversHostname(
    portalHostname,
    tls.certificate?.names ?? [],
  );
  if (!tls.cutoverApplied || !portalHostname || !portalCovered) {
    throw new SetupApiValidationError(
      'Zuerst HTTPS für den Portal-Hostnamen vollständig einrichten.',
    );
  }

  updateEnvKeys(envPath, {
    [RESTRICTED_NETWORK_IP_ENV]: candidate.address,
    [RESTRICTED_NETWORK_INTERFACE_ID_ENV]: candidate.interfaceId,
    [RESTRICTED_NETWORK_WARNINGS_CONFIRMED_ENV]: String(input.warningsConfirmed),
    [RESTRICTED_NETWORK_SAME_INTERFACE_CONFIRMED_ENV]: String(
      candidate.relationToStaff === 'same-interface' && input.warningsConfirmed,
    ),
  });
  return deps.inspect ? deps.inspect() : inspectRestrictedNetwork(ctx);
}

type RestrictedNetworkMutationHooks = HostWriteRuntimeHooks & {
  inspect?: () => Promise<RestrictedNetworkInspectResult>;
  auditListeners?: typeof auditRestrictedListeners;
  restoreProxyRestartPolicy?: typeof restoreProxyRestartPolicy;
};

const GENERATED_CADDYFILE_PATTERN = /^# PRAXIS-FLOW-GENERATED LAN-TLS v\d+\s*$/m;

function restrictedPrerequisiteError(inspect: RestrictedNetworkInspectResult): string | null {
  const required = new Set([
    'restricted.platform',
    'restricted.tls',
    'restricted.portal-dns-public',
    'restricted.portal-dns-local',
    'restricted.local-ip',
  ]);
  const failed = inspect.checks.find((check) => required.has(check.id) && !check.ok);
  if (!failed) return null;
  return failed.detail ? `${failed.message}. ${failed.detail}` : failed.message;
}

async function mutateRestrictedNetwork(
  ctx: SetupContext,
  enable: boolean,
  hooks: RestrictedNetworkMutationHooks = {},
): Promise<RestrictedNetworkInspectResult> {
  await recoverRestrictedOperation(resolveComposeRunOptions(ctx));
  let operationId: string | undefined = undefined;
  const inspect = hooks.inspect ?? (() => inspectRestrictedNetwork(ctx, operationId));
  const before = await inspect();
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    throw new SetupApiValidationError('Setup muss vor dem Patientenzugang abgeschlossen sein.');
  }
  if (enable) {
    if (!before.status.binding) {
      throw new SetupApiValidationError('Zuerst eine Netzwerkadresse vorbereiten.');
    }
    const prerequisiteError = restrictedPrerequisiteError(before);
    if (prerequisiteError) {
      throw new SetupApiValidationError(
        `Patientenzugang kann nicht aktiviert werden: ${prerequisiteError}`,
      );
    }
    if (before.status.phase === 'applied' && before.status.health !== 'degraded') return before;
  } else if (!before.status.binding) {
    return before;
  }

  const existing = readEnvMap(envPath);
  const proxy = requireProxyConfig(existing);
  if (enable && (!proxy.enabled || !readTlsStatus(existing).cutoverApplied)) {
    throw new SetupApiValidationError('Patientenzugang erfordert einen aktiven HTTPS-Proxy.');
  }
  if (!enable && !proxy.enabled) {
    removeEnvKeys(envPath, [...RESTRICTED_NETWORK_PERSISTED_KEYS]);
    return inspect();
  }
  const staffIp = pickLanIpFromEnv(existing);
  if (!staffIp) {
    throw new SetupApiValidationError(
      'Patientenzugang kann ohne gespeicherte Staff-IP nicht geändert werden.',
    );
  }
  const runOptions = resolveComposeRunOptions(ctx);
  const runComposePs = hooks.composePs ?? composePs;
  const runComposeRemove = hooks.composeRemoveServices ?? composeRemoveServices;
  const runComposeUp = hooks.composeUp ?? composeUp;
  const runComposeStop = hooks.composeStop ?? composeStop;
  const composeBefore = await runComposePs(runOptions);
  const stackWasRunning = composeBefore.running;
  if (enable && !stackWasRunning) {
    throw new SetupApiValidationError(
      'Praxis Flow muss laufen, bevor der Patientenzugang aktiviert werden kann.',
    );
  }
  if (enable || stackWasRunning) {
    assertStaffIpAvailable(staffIp, hooks);
    await ensureProxyImageForCompose(existing, hooks);
  }

  const backup = backupEnvFile(ctx.home);
  const caddyfilePath = resolveProxyTlsPaths(ctx.home).caddyfile;
  const previousCaddyfile = fs.existsSync(caddyfilePath) ? fs.readFileSync(caddyfilePath) : null;
  const restoreCaddyfile = () => {
    if (previousCaddyfile) {
      fs.writeFileSync(caddyfilePath, previousCaddyfile);
    } else if (fs.existsSync(caddyfilePath)) {
      fs.unlinkSync(caddyfilePath);
    }
  };

  // All tentative runtime changes use a separate env and restart:no overlay.
  const operation = beginRestrictedOperation(ctx.home, enable, stackWasRunning);
  try {
    operationId = operation.id;
    const operationOptions = { ...runOptions, restrictedOperationId: operation.id };
    const candidateEnvPath = restrictedOperationEnv(ctx.home, operation.id);
    durableWrite(candidateEnvPath, operation.previousEnv);
    updateEnvKeys(candidateEnvPath, { [RESTRICTED_NETWORK_ENABLED_ENV]: String(enable) });
    const finish = () => finishRestrictedOperation(ctx.home, operation.id);

    {
      if (
        previousCaddyfile &&
        !GENERATED_CADDYFILE_PATTERN.test(previousCaddyfile.toString('utf8'))
      ) {
        finish();
        throw new SetupApiValidationError(
          'Die vorhandene Proxy-Konfiguration wird nicht von Praxis Flow verwaltet und kann nicht automatisch aktualisiert werden.',
        );
      }
      try {
        const targetEnv = new Map(existing);
        targetEnv.set(RESTRICTED_NETWORK_ENABLED_ENV, String(enable));
        writeGeneratedTlsCaddyfile(ctx.home, readTlsStatus(targetEnv), targetEnv);
        const validateCaddy = hooks.composeExec ?? composeExec;
        const validation = await validateCaddy({
          ...operationOptions,
          withProxy: true,
          service: 'proxy',
          args: ['caddy', 'validate', '--config', '/etc/caddy/Caddyfile'],
          oneOff: !stackWasRunning,
        });
        if (!validation.ok) {
          throw new Error(validation.log || 'Caddy-Konfiguration ist ungültig.');
        }
        const written = fs.readFileSync(caddyfilePath, 'utf8');
        if (
          !written.startsWith(GENERATED_CADDYFILE_MARKER) ||
          written.includes(':444 {') !== enable
        ) {
          throw new Error('Der Restricted-Listener fehlt in der Proxy-Konfiguration.');
        }
      } catch (error) {
        restoreCaddyfile();
        finish();
        throw new SetupApiValidationError(
          `Patientenzugang konnte nicht vorbereitet werden; die Proxy-Konfiguration ist ungültig. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    let rollbackAttempted = false;
    const rollback = async (reason: string): Promise<never> => {
      rollbackAttempted = true;
      const failedOptions = operationOptions;
      let cleanup: { ok: boolean; log: string };
      try {
        cleanup = await runComposeRemove({ ...failedOptions, withProxy: true }, ['proxy']);
      } catch (error) {
        cleanup = { ok: false, log: error instanceof Error ? error.message : String(error) };
      }
      fs.copyFileSync(backup.backupPath, envPath);
      restoreCaddyfile();
      durableWrite(candidateEnvPath, operation.previousEnv);
      let rollbackOk = cleanup.ok;
      let rollbackLog = cleanup.log;
      if (stackWasRunning) {
        let restored: Awaited<ReturnType<typeof composeUp>>;
        try {
          restored = await runComposeUp({ ...operationOptions, withProxy: true, build: false });
        } catch (error) {
          restored = {
            ok: false,
            log: error instanceof Error ? error.message : String(error),
            gatewaySkipped: false,
          };
        }
        rollbackOk = rollbackOk && restored.ok;
        rollbackLog = [rollbackLog, restored.log].filter(Boolean).join('\n');
        if (rollbackOk) {
          const health = await waitForExpectedStackHealth(
            runComposePs,
            { ...operationOptions, withProxy: true },
            hooks.stackHealthWaitOptions,
          );
          rollbackOk = health.ok;
          if (!health.ok) rollbackLog = [rollbackLog, ...health.errors].filter(Boolean).join('\n');
        }
        if (rollbackOk) {
          const restoredEnv = readEnvMap(envPath);
          const restoredCompose = await runComposePs(operationOptions);
          const auditError = failedStaffBindingAudit({
            compose: restoredCompose,
            env: restoredEnv,
            staffIp,
            proxyEnabled: true,
            hooks,
          });
          rollbackOk = !auditError;
          if (auditError) {
            rollbackLog = [rollbackLog, `Rollback-Runtime-Audit: ${auditError}`]
              .filter(Boolean)
              .join('\n');
          }
        }
      } else {
        let stopped: Awaited<ReturnType<typeof composeStop>>;
        try {
          stopped = await runComposeStop({
            ...operationOptions,
            withProxy: true,
            services: ['proxy'],
          });
        } catch (error) {
          stopped = { ok: false, log: error instanceof Error ? error.message : String(error) };
        }
        rollbackOk = rollbackOk && stopped.ok;
        rollbackLog = [rollbackLog, stopped.log].filter(Boolean).join('\n');
      }
      if (rollbackOk) {
        if (stackWasRunning)
          await (hooks.restoreProxyRestartPolicy ?? restoreProxyRestartPolicy)(operationOptions);
        finish();
      }
      throw new SetupApiValidationError(
        [
          reason,
          rollbackOk
            ? 'Der vorherige Patientenzugang wurde wiederhergestellt.'
            : 'Rollback unvollständig; Praxis Flow bis zur Prüfung nicht als sicher gebunden behandeln.',
          rollbackLog && `Rollback: ${rollbackLog}`,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    };

    let configCheck: Awaited<ReturnType<typeof composeValidateConfig>>;
    try {
      configCheck = await (hooks.composeValidateConfig ?? composeValidateConfig)({
        ...operationOptions,
        withProxy: true,
      });
    } catch (error) {
      fs.copyFileSync(backup.backupPath, envPath);
      restoreCaddyfile();
      finish();
      throw new SetupApiValidationError(
        `Patientenzugang konnte nicht vorbereitet werden; die Laufzeit blieb unverändert. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!configCheck.ok) {
      fs.copyFileSync(backup.backupPath, envPath);
      restoreCaddyfile();
      finish();
      throw new SetupApiValidationError(
        `Patientenzugang konnte nicht vorbereitet werden; die Laufzeit blieb unverändert. ${configCheck.log}`,
      );
    }

    try {
      const removed = await runComposeRemove({ ...operationOptions, withProxy: true }, ['proxy']);
      if (!removed.ok) await rollback(removed.log || 'Proxy konnte nicht neu erzeugt werden.');

      if (stackWasRunning) {
        const up = await runComposeUp({
          ...operationOptions,
          withProxy: true,
          build: false,
        });
        if (!up.ok) await rollback(up.log || 'Proxy konnte nicht gestartet werden.');
        const health = await waitForExpectedStackHealth(
          runComposePs,
          { ...operationOptions, withProxy: true },
          hooks.stackHealthWaitOptions,
        );
        if (!health.ok) await rollback(health.errors.join('\n'));
      }

      const currentEnv = readEnvMap(candidateEnvPath);
      if (stackWasRunning) {
        const currentCompose = await runComposePs(operationOptions);
        const auditError = failedStaffBindingAudit({
          compose: currentCompose,
          env: currentEnv,
          staffIp,
          proxyEnabled: true,
          hooks,
        });
        if (auditError) await rollback(`Runtime-Bindung unsicher: ${auditError}`);
      }

      if (enable) {
        const binding = before.status.binding;
        const tls = readTlsStatus(currentEnv);
        const staffHostname = tls.staffHostname?.trim() || '';
        const portalHostname = tls.portalHostname?.trim() || '';
        if (!binding || !staffHostname || !portalHostname) {
          await rollback('Listener-Prüfung konnte die Staff-/Portal-Identität nicht bestimmen.');
        }
        const listenerError = await (hooks.auditListeners ?? auditRestrictedListeners)({
          staffIp,
          restrictedIp: binding.hostIp,
          staffHostname,
          portalHostname,
          contract: readInstalledPortalContract(ctx.home),
        });
        if (listenerError) await rollback(`Listener-Prüfung fehlgeschlagen: ${listenerError}`);
      }

      // Commit only after the tentative runtime and listener audits have passed.
      if (!enable) removeEnvKeys(candidateEnvPath, [...RESTRICTED_NETWORK_PERSISTED_KEYS]);
      durableWrite(envPath, fs.readFileSync(candidateEnvPath, 'utf8'));
      const result = await inspect();
      if (enable && (result.status.phase !== 'applied' || result.status.health === 'degraded')) {
        await rollback('Restricted-Publish wurde nach dem Start nicht eindeutig nachgewiesen.');
      }
      if (stackWasRunning)
        await (hooks.restoreProxyRestartPolicy ?? restoreProxyRestartPolicy)(operationOptions);
      fs.rmSync(path.join(ctx.home, 'state/restricted-recovery.json'), { force: true });
      finish();
      return result;
    } catch (error) {
      if (rollbackAttempted) throw error;
      return rollback(error instanceof Error ? error.message : String(error));
    }
  } finally {
    releaseRestrictedOperation(operation.id);
  }
}

export async function applyRestrictedNetwork(
  ctx: SetupContext,
  hooks: RestrictedNetworkMutationHooks = {},
): Promise<RestrictedNetworkInspectResult> {
  return mutateRestrictedNetwork(ctx, true, hooks);
}

export async function removeRestrictedNetwork(
  ctx: SetupContext,
  hooks: RestrictedNetworkMutationHooks = {},
): Promise<RestrictedNetworkInspectResult> {
  return mutateRestrictedNetwork(ctx, false, hooks);
}

export function buildSetupPlan(
  input: NormalizedSetupPlanInput,
  env: Map<string, string> | null = null,
): SetupPlan {
  const { proxy } = resolveProxyForHostWrite(env, input.proxy);
  const canonicalBaseUrl = resolveCanonicalBaseUrlForProxyPlan({
    proxy,
    existingCanonical: env?.get('CANONICAL_BASE_URL'),
    nextLanIp: input.lanAppIp.trim(),
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
    ...RESTRICTED_NETWORK_PERSISTED_KEYS,
  ];
  const proxyWasEnabled = isProxyCurrentlyEnabled(existingBefore);
  const canonicalToWrite = resolveCanonicalBaseUrlForProxyPlan({
    proxy,
    existingCanonical: existingBefore.get('CANONICAL_BASE_URL'),
    nextLanIp: input.lanAppIp.trim(),
  });
  const deviceUrls = buildDeviceUrlsFromBaseUrl(canonicalToWrite);
  const gateway: GatewayPlan = {
    ...input.gateway,
    portalAppIp: input.portalAppIp?.trim() || input.lanAppIp,
  };
  const gatewayEnv = buildGatewayEnv(gateway, deviceUrls);

  const runComposePs = hooks?.composePs ?? composePs;
  const runComposeRemove = hooks?.composeRemoveServices ?? composeRemoveServices;
  const runComposeStop = hooks?.composeStop ?? composeStop;
  const runComposeUp = hooks?.composeUp ?? composeUp;

  if (input.runCompose && proxy.enabled) {
    assertStaffIpAvailable(input.lanAppIp.trim(), hooks);
  }

  const deliveryEarly = Boolean(isDeliveryProfile(projectRoot) || input.delivery);
  const runOptionsEarly = {
    projectRoot,
    delivery: deliveryEarly,
    composeProjectName: ctx.composeProjectName,
  };
  const composeBeforeApply = input.runCompose ? await runComposePs(runOptionsEarly) : null;

  const removeProxyAfterWrite = Boolean(
    input.runCompose &&
    !proxy.enabled &&
    writeProxyEnv &&
    (existingBefore.has('PROXY_ENABLED') ||
      existingBefore.has('PROXY_MODE') ||
      existingBefore.get('APP_BIND_ADDRESS') === '127.0.0.1'),
  );

  const { envPath, backupPath, keysWritten } = writeEnvFromExample(
    projectRoot,
    {
      practiceDisplayName: input.practiceDisplayName,
      secrets,
      extra: {
        ...releaseEnv,
        ...gatewayEnv,
        ...(writeProxyEnv ? buildProxyEnvUpdates(proxy, existingBefore) : {}),
        APP_BIND_ADDRESS: resolveAppBindAddress(proxy.enabled),
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
    const delivery = Boolean(isDeliveryProfile(projectRoot) || input.delivery);
    const runOptions = {
      projectRoot,
      delivery,
      composeProjectName: ctx.composeProjectName,
    };
    const rollbackFailedSetupApply = async (reason: string): Promise<never> => {
      const cleanup = await runComposeRemove(
        { ...runOptions, withProxy: proxy.enabled || proxyWasEnabled },
        resolveProductComposeServices({
          ...runOptions,
          withProxy: proxy.enabled || proxyWasEnabled,
        }),
      );
      const cleanupLog = cleanup.ok ? cleanup.log : `Cleanup fehlgeschlagen: ${cleanup.log}`;
      if (backupPath) {
        fs.copyFileSync(backupPath, envPath);
      } else if (cleanup.ok && fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
      let rollbackOk = cleanup.ok;
      let rollbackLog = '';
      if (composeBeforeApply?.running && backupPath) {
        const rollback = await runComposeUp({
          ...runOptionsEarly,
          build: false,
          withGateway: input.gateway.enabled,
          withProxy: proxyWasEnabled,
        });
        rollbackLog = rollback.log;
        rollbackOk = rollbackOk && rollback.ok;
      } else if (backupPath) {
        const stopped = await runComposeStop({
          ...runOptionsEarly,
          withProxy: proxyWasEnabled,
          services: resolveProductComposeServices({
            ...runOptionsEarly,
            withProxy: proxyWasEnabled,
          }),
        });
        rollbackLog = stopped.log;
        rollbackOk = rollbackOk && stopped.ok;
      }
      if (backupPath) {
        if (rollbackOk && composeBeforeApply?.running) {
          const health = await waitForExpectedStackHealth(
            runComposePs,
            { ...runOptionsEarly, withProxy: proxyWasEnabled },
            hooks?.stackHealthWaitOptions,
          );
          rollbackOk = health.ok;
          if (!health.ok) rollbackLog = [rollbackLog, ...health.errors].filter(Boolean).join('\n');
        }
        const restoredCompose = await runComposePs({
          ...runOptionsEarly,
          withProxy: proxyWasEnabled,
        });
        const restoredExpected = withExpectedStackRunning(restoredCompose, {
          ...runOptionsEarly,
          withProxy: proxyWasEnabled,
        });
        rollbackOk =
          rollbackOk &&
          (composeBeforeApply?.running ? restoredExpected.running : !restoredCompose.running);
        if (rollbackOk && composeBeforeApply?.running && proxyWasEnabled) {
          rollbackOk =
            failedStaffBindingAudit({
              compose: restoredCompose,
              env: existingBefore,
              staffIp: existingBefore.get('SETUP_LAN_APP_IP')?.trim() || '',
              proxyEnabled: true,
              hooks,
            }) === null;
        }
      }
      const detail = [
        reason,
        cleanupLog && `Cleanup: ${cleanupLog}`,
        rollbackLog && `Rollback: ${rollbackLog}`,
      ]
        .filter(Boolean)
        .join('\n');
      const outcome = rollbackOk
        ? 'vorheriger Zustand wurde wiederhergestellt.'
        : backupPath
          ? 'Env wurde restauriert, die Laufzeit jedoch nicht vollständig wiederhergestellt.'
          : 'Teilzustand konnte nicht vollständig bereinigt werden; die .env bleibt für die Wiederherstellung erhalten.';
      throw new SetupApiValidationError(
        `Setup konnte das Staff-Binding nicht anwenden; ${outcome}${detail ? ` ${detail}` : ''}`,
      );
    };
    try {
      const configCheck = await (hooks?.composeValidateConfig ?? composeValidateConfig)({
        ...runOptions,
        withGateway: input.gateway.enabled,
        withProxy: proxy.enabled,
      });
      if (!configCheck.ok) throw new Error(configCheck.log);
    } catch (error) {
      restoreEnvAfterPreflightFailure(envPath, backupPath, error, 'Compose-Konfigurationsprüfung');
    }
    if (removeProxyAfterWrite) {
      const removed = await runComposeRemove({ ...runOptionsEarly, withProxy: true }, ['proxy']);
      if (!removed.ok) {
        await rollbackFailedSetupApply(removed.log || 'Proxy konnte nicht entfernt werden.');
      }
    }
    if (proxy.enabled) {
      try {
        await ensureProxyImageForCompose(envAfterWrite, hooks);
      } catch (error) {
        restoreEnvAfterPreflightFailure(envPath, backupPath, error);
      }
    }
    compose = await runComposeUp({
      ...runOptions,
      withGateway: input.gateway.enabled,
      withProxy: proxy.enabled,
      build: resolveComposeBuild({ ...input, delivery }),
    });
    if (!compose.ok) {
      await rollbackFailedSetupApply(compose.log);
    }
    const runtimeCompose = await runComposePs({ ...runOptions, withProxy: proxy.enabled });
    const auditError = failedStaffBindingAudit({
      compose: runtimeCompose,
      env: envAfterWrite,
      staffIp: input.lanAppIp.trim(),
      proxyEnabled: proxy.enabled,
      hooks,
    });
    if (auditError) {
      await rollbackFailedSetupApply(auditError);
    }
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
    const runOptions = resolveComposeRunOptions(ctx);
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
  const runOptions = resolveComposeRunOptions(ctx);
  const runComposePs = hooks?.composePs ?? composePs;
  const runComposeRemove = hooks?.composeRemoveServices ?? composeRemoveServices;
  const runComposeStop = hooks?.composeStop ?? composeStop;
  const runComposeUp = hooks?.composeUp ?? composeUp;
  const composeBefore = await runComposePs(runOptions);
  const stackWasRunning = composeBefore.running;
  const repairProxy = Boolean(input.repairProxy);

  const { proxy, writeEnv: writeProxyEnv } = resolveProxyForHostWrite(existing, input.proxy);
  const proxyWasEnabled = isProxyCurrentlyEnabled(existing);

  if (repairProxy && !proxy.enabled) {
    throw new SetupApiValidationError(
      'Proxy-Wiederherstellung nur möglich, wenn der Proxy aktiviert ist.',
    );
  }

  if ((Boolean(input.restartCompose) || repairProxy) && proxy.enabled) {
    assertStaffIpAvailable(lanAppIp, hooks);
  }

  const canonicalBaseUrl = resolveCanonicalBaseUrlForProxyPlan({
    proxy,
    existingCanonical: existing.get('CANONICAL_BASE_URL'),
    nextLanIp: lanAppIp,
  });
  const deviceUrls = buildDeviceUrlsFromBaseUrl(canonicalBaseUrl);
  const updates: Record<string, string> = {
    SETUP_LAN_APP_IP: lanAppIp,
    CANONICAL_BASE_URL: canonicalBaseUrl,
    ...tlsPreparationLanIpSyncUpdates(existing, lanAppIp),
    ...(writeProxyEnv ? buildProxyEnvUpdates(proxy, existing) : {}),
    APP_BIND_ADDRESS: resolveAppBindAddress(proxy.enabled),
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

  const backup = backupEnvFile(ctx.home);
  const { keysWritten } = updateEnvKeys(envPath, updates);
  if (!gateway.enabled) {
    const { keysRemoved } = removeEnvKeys(envPath, [...GATEWAY_ENV_KEYS]);
    keysWritten.push(...keysRemoved);
  }

  const rollbackFailedBindingApply = async (reason: string): Promise<never> => {
    const failedRunOptions = resolveComposeRunOptions(ctx);
    const cleanup = await runComposeRemove(
      { ...failedRunOptions, withProxy: proxy.enabled || proxyWasEnabled },
      resolveProductComposeServices({
        ...failedRunOptions,
        withProxy: proxy.enabled || proxyWasEnabled,
      }),
    );
    const cleanupLog = cleanup.ok ? cleanup.log : `Cleanup fehlgeschlagen: ${cleanup.log}`;
    fs.copyFileSync(backup.backupPath, envPath);
    let rollbackOk = cleanup.ok;
    let rollbackLog: string;
    if (stackWasRunning) {
      const rollback = await runComposeUp({
        ...runOptions,
        build: false,
        withGateway: gateway.enabled,
        withProxy: proxyWasEnabled,
      });
      rollbackLog = rollback.log;
      rollbackOk = rollbackOk && rollback.ok;
    } else {
      const stopped = await runComposeStop({
        ...runOptions,
        withProxy: proxyWasEnabled,
        services: resolveProductComposeServices({ ...runOptions, withProxy: proxyWasEnabled }),
      });
      rollbackLog = stopped.log;
      rollbackOk = rollbackOk && stopped.ok;
    }
    if (rollbackOk && stackWasRunning) {
      const health = await waitForExpectedStackHealth(
        runComposePs,
        { ...runOptions, withProxy: proxyWasEnabled },
        hooks?.stackHealthWaitOptions,
      );
      rollbackOk = health.ok;
      if (!health.ok) rollbackLog = [rollbackLog, ...health.errors].filter(Boolean).join('\n');
    }
    const restoredCompose = await runComposePs({ ...runOptions, withProxy: proxyWasEnabled });
    const restoredExpected = withExpectedStackRunning(restoredCompose, {
      ...runOptions,
      withProxy: proxyWasEnabled,
    });
    rollbackOk =
      rollbackOk && (stackWasRunning ? restoredExpected.running : !restoredCompose.running);
    if (rollbackOk && stackWasRunning && proxyWasEnabled) {
      rollbackOk =
        failedStaffBindingAudit({
          compose: restoredCompose,
          env: existing,
          staffIp: existing.get('SETUP_LAN_APP_IP')?.trim() || '',
          proxyEnabled: true,
          hooks,
        }) === null;
    }
    const detail = [
      reason,
      cleanupLog && `Cleanup: ${cleanupLog}`,
      rollbackLog && `Rollback: ${rollbackLog}`,
    ]
      .filter(Boolean)
      .join('\n');
    const outcome = rollbackOk
      ? 'vorherige Konfiguration und Laufzeit wurden wiederhergestellt.'
      : 'Env wurde restauriert, die Laufzeit jedoch nicht vollständig wiederhergestellt.';
    throw new SetupApiValidationError(
      `Staff-Binding konnte nicht angewendet werden; ${outcome}${detail ? ` ${detail}` : ''}`,
    );
  };

  if (shouldComposeUp || proxyActions.removeProxyFirst) {
    try {
      const configCheck = await (hooks?.composeValidateConfig ?? composeValidateConfig)({
        ...resolveComposeRunOptions(ctx),
        withGateway: gateway.enabled,
        withProxy: proxy.enabled,
      });
      if (!configCheck.ok) throw new Error(configCheck.log);
    } catch (error) {
      restoreEnvAfterPreflightFailure(
        envPath,
        backup.backupPath,
        error,
        'Compose-Konfigurationsprüfung',
      );
    }
  }
  if (proxyActions.removeProxyFirst) {
    const removed = await runComposeRemove({ ...runOptions, withProxy: true }, ['proxy']);
    restartLog = removed.log || null;
    if (!removed.ok) {
      await rollbackFailedBindingApply(removed.log || 'Proxy konnte nicht entfernt werden.');
    }
  }

  if (shouldComposeUp) {
    const envAfter = readEnvMap(envPath);
    if (proxy.enabled) {
      try {
        await ensureProxyImageForCompose(envAfter, hooks);
      } catch (error) {
        restoreEnvAfterPreflightFailure(envPath, backup.backupPath, error);
      }
    }
    const up = await runComposeUp({
      ...resolveComposeRunOptions(ctx),
      build: false,
      withGateway: gateway.enabled,
      withProxy: proxy.enabled,
    });
    if (!up.ok) {
      await rollbackFailedBindingApply(up.log);
    }
    composeRestarted = up.ok;
    gatewayComposeSkipped = up.gatewaySkipped;
    restartLog = [restartLog, up.log].filter(Boolean).join('\n') || null;
    compose = await runComposePs({
      ...resolveComposeRunOptions(ctx),
      withProxy: proxy.enabled,
    });
    const auditError = failedStaffBindingAudit({
      compose,
      env: envAfter,
      staffIp: lanAppIp,
      proxyEnabled: proxy.enabled,
      hooks,
    });
    if (auditError) {
      await rollbackFailedBindingApply(auditError);
    }
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
  const runOptions = resolveComposeRunOptions(ctx);
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
