import { auditRestrictedStart, type RestrictedStartAuditHooks } from './restricted-start-audit.js';
import { restrictedPlatformSupported, restrictedPlatformMessage } from './restricted-platform.js';

import { createModuleLogger } from './logger.js';
import {
  beginBindingOperation,
  readBindingOperation,
  readBindingOperationStatus,
  writeBindingOperation,
  finishBindingOperation,
} from './binding-operation.js';
import { syncMaintenanceHostFiles, syncParents } from './maintenance-files.js';
import { readConfirmedHostConfig } from './confirmed-host-config.js';
import { readTlsOperationStatus } from './tls-operation.js';
import { readRestoreOperationStatus } from './restore-operation.js';
import { hostMutationLock } from './host-mutation-lock.js';
import { runHostMutation, assertNoMaintenanceOperation } from './maintenance-operation-guard.js';
import { readUpdateOperationStatus } from './update-operation.js';
import { pinRecoveryBackup, readPinnedRecoveryBackup } from './recovery-backup.js';
import { attachInstallBackup } from './install-operation.js';
import { createRuntimePostcondition, auditRuntimePostcondition } from './runtime-postcondition.js';
import { readHostLifecycle, inspectLifecycleResidues } from './host-lifecycle-facts.js';
import { hostLifecycleKey } from './host-lifecycle.js';
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
  type ComposeStatus,
} from './docker.js';
import {
  waitForExpectedStackHealth,
  withExpectedStackRunning,
  type WaitForStackHealthOptions,
} from './stack-health.js';
import {
  backupEnvFile,
  parseEnvMap,
  readEnvMap,
  removeEnvKeys,
  updateEnvKeys,
  writeEnvFromExample,
} from './env-file.js';
import { createPfbackup, getPfbackupInfo } from './settings-backup.js';
import { inspectPfbackup } from './settings-backup-inspect.js';
import { restorePfbackup } from './settings-backup-restore.js';
import { applyPfupdate } from './settings-backup-update.js';
import { inspectPfupdate } from './pfupdate-inspect.js';
import { inspectMaintenanceCompatibility } from './settings-format-version.js';
import {
  coreInstallationServicesHealthy,
  deriveInstallationState,
  installationStartFailureMessages,
} from './installation-state.js';
import { inspectExistingAppDatabase, startExistingInstallation } from './installation-start.js';
import {
  normalizeStorageFoldersInput,
  resolveStorageFoldersFromSources,
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
  activatePreparedPfinstall,
  extractPreparedPfinstallTemplates,
  isDeliveryProfile,
  preparePfinstall,
} from './delivery-images.js';
import {
  abortPreparedInstallOperation,
  installOperationSummary,
  markInstallOperationInstalling,
  readInstallOperation,
} from './install-operation.js';
import { factoryResetInstallation } from './factory-reset.js';
import { readManagerState, releaseEnvFromManagerState } from './manager-state.js';
import {
  appendSandboxClamAvLogSection,
  fetchSandboxScannerStatus,
  resolveMaxSignatureAgeHours,
  type SandboxScannerStatus,
} from './sandbox-health.js';
import {
  DEFAULT_STAFF_PIN,
  evaluateHostLifecycleAction,
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
  InstallationStartResult,
  InstallPrepareInput,
  InstallPrepareResult,
  InstallCommitInput,
  InstallCommitResult,
  InstallAbortResult,
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
  LOCAL_MAINTENANCE_APP_BASE_URL,
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
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
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
import { assertHostLifecycleAction } from './host-lifecycle-guard.js';

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
  inspectLifecycleResidues?: () => Promise<'none' | 'present' | 'unknown'>;
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

const bindingLogger = createModuleLogger('setup.binding');

class BindingPreflightError extends Error {
  constructor(
    readonly stage: string,
    cause: unknown,
  ) {
    super(`${stage} fehlgeschlagen.`, { cause });
  }
}

async function checkBindingPreflight(
  options: Parameters<typeof composeValidateConfig>[0],
  env: Map<string, string>,
  hooks?: HostWriteRuntimeHooks,
): Promise<void> {
  try {
    const check = await (hooks?.composeValidateConfig ?? composeValidateConfig)(options);
    if (!check.ok) throw new Error(check.log);
  } catch (error) {
    throw new BindingPreflightError('Compose-Konfigurationsprüfung', error);
  }
  if (options.withProxy) {
    try {
      await ensureProxyImageForCompose(env, hooks);
    } catch (error) {
      throw new BindingPreflightError('Proxy-Image-Prüfung', error);
    }
  }
}

/** The same rollback handles caught failures and a process interrupted after env/Compose writes. */
export async function recoverBindingOperation(
  ctx: SetupContext,
  hooks?: HostWriteRuntimeHooks,
): Promise<{ ok: boolean; errors: string[] }> {
  return hostMutationLock(ctx.home).run('binding-recovery', async () => {
    const op = readBindingOperation(ctx.home);
    if (!op) return { ok: true, errors: [] };
    if (op.phase === 'committed' || op.phase === 'recovered') {
      finishBindingOperation(ctx.home, op);
      return { ok: true, errors: [] };
    }
    const errors: string[] = [];
    try {
      assertNoMaintenanceOperation(ctx.home, true);
      const envPath = path.join(ctx.home, '.env');
      const previous = parseEnvMap(op.previousEnv ?? '');
      const runOptions = {
        projectRoot: ctx.home,
        composeProjectName: ctx.composeProjectName,
        delivery: op.delivery,
      };
      if (op.runtimeChanged) {
        const current = readEnvMap(envPath);
        const cleanupOptions = {
          ...runOptions,
          withProxy: isProxyCurrentlyEnabled(current) || isProxyCurrentlyEnabled(previous),
        };
        const cleanup = await (hooks?.composeRemoveServices ?? composeRemoveServices)(
          cleanupOptions,
          resolveProductComposeServices(cleanupOptions),
        );
        if (!cleanup.ok) throw new Error(`Cleanup fehlgeschlagen: ${cleanup.log}`);
      }
      if (op.previousEnv !== null) durableWrite(envPath, op.previousEnv);
      else {
        fs.rmSync(envPath, { force: true });
        syncParents(ctx.home, ctx.home);
      }
      if (op.runtimeChanged && op.previousEnv !== null) {
        const previousOptions = { ...runOptions, withProxy: isProxyCurrentlyEnabled(previous) };
        const readCompose = hooks?.composePs ?? composePs;
        if (op.stackWasRunning) {
          const up = await (hooks?.composeUp ?? composeUp)({
            ...previousOptions,
            build: false,
            withGateway: readGatewayStatusFromEnv(previous).enabled,
          });
          if (!up.ok) throw new Error(up.log);
          const health = await waitForExpectedStackHealth(
            readCompose,
            previousOptions,
            hooks?.stackHealthWaitOptions,
          );
          if (!health.ok) throw new Error(health.errors.join('\n'));
          const bindingError = failedStaffBindingAudit({
            compose: health.compose,
            env: previous,
            staffIp: pickLanIpFromEnv(previous) ?? '',
            proxyEnabled: previousOptions.withProxy,
            hooks,
          });
          if (bindingError) throw new Error(bindingError);
        } else {
          const stopped = await (hooks?.composeStop ?? composeStop)({
            ...previousOptions,
            services: resolveProductComposeServices(previousOptions),
          });
          if (!stopped.ok) throw new Error(stopped.log);
        }
        const compose = await readCompose(previousOptions);
        if (
          op.stackWasRunning
            ? !withExpectedStackRunning(compose, previousOptions).running
            : compose.running
        )
          throw new Error('Vorheriger Laufzustand nicht wiederhergestellt.');
      }
      syncMaintenanceHostFiles(ctx.home);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      writeBindingOperation(ctx.home, { ...op, phase: 'recovery-failed' });
      return { ok: false, errors };
    }
    const recovered = { ...op, phase: 'recovered' as const };
    writeBindingOperation(ctx.home, recovered);
    try {
      finishBindingOperation(ctx.home, recovered);
    } catch (error) {
      bindingLogger.error({ err: error }, 'Binding-Cleanup wird beim Start erneut versucht');
    }
    return { ok: true, errors };
  });
}

async function runBindingChange<T>(
  ctx: SetupContext,
  stackWasRunning: boolean,
  delivery: boolean,
  hooks: HostWriteRuntimeHooks | undefined,
  change: (beginRuntime: () => void) => Promise<T>,
): Promise<T> {
  let op = beginBindingOperation(ctx.home, stackWasRunning, delivery);
  let result: T;
  try {
    result = await change(() => {
      op = { ...op, phase: 'cutover', runtimeChanged: true };
      writeBindingOperation(ctx.home, op);
    });
    syncMaintenanceHostFiles(ctx.home);
    writeBindingOperation(ctx.home, { ...op, phase: 'committed' });
  } catch (error) {
    // Read the durable boundary, including a journal write that failed after rename.
    const stored = readBindingOperation(ctx.home);
    if (stored?.phase === 'committed')
      throw hostOperationError(
        'binding_commit_uncertain',
        'Die Änderung ist bestätigt, ihr Abschluss konnte aber nicht vollständig gesichert werden. Bitte den Manager neu starten.',
        error,
        'inconsistent',
      );
    const unchanged = stored?.runtimeChanged === false;
    const recovery = await recoverBindingOperation(ctx, hooks);
    throw hostOperationError(
      recovery.ok
        ? unchanged
          ? 'setup_preflight_failed'
          : 'staff_binding_apply_failed'
        : 'staff_binding_rollback_incomplete',
      recovery.ok
        ? unchanged
          ? `${error instanceof BindingPreflightError ? error.stage : 'Vorprüfung'} fehlgeschlagen; vorheriger Env-Zustand wurde wiederhergestellt, die Laufzeit blieb unverändert.`
          : 'Änderung fehlgeschlagen; vorheriger Zustand wurde wiederhergestellt.'
        : 'Änderung fehlgeschlagen; vorheriger Zustand wurde nicht vollständig wiederhergestellt. Bitte die Setup-Diagnose prüfen.',
      recovery.ok
        ? error instanceof BindingPreflightError
          ? error.cause
          : error
        : new Error(recovery.errors.join('\n'), { cause: error }),
      recovery.ok ? 'operation-failed' : 'inconsistent',
    );
  }
  try {
    finishBindingOperation(ctx.home, { ...op, phase: 'committed' });
  } catch (error) {
    bindingLogger.error({ err: error }, 'Binding-Cleanup wird beim Start erneut versucht');
  }
  return result;
}

function hostOperationError(
  code: string,
  message: string,
  cause: unknown,
  category: 'operation-failed' | 'inconsistent' = 'operation-failed',
): ManagerApiError {
  return new ManagerApiError({ code, category, message, retryable: false }, { cause });
}

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
    throw new ManagerApiError({
      code: 'compose_status_unavailable',
      category: 'unavailable',
      retryable: true,
      message: 'Der Containerstatus konnte nicht geprüft werden. Bitte erneut versuchen.',
    });
  }
  return (await readComposeForHost(ctx, true, docker, readEnvMap(envPath)))!;
}

export async function runComposeAction(
  ctx: SetupContext,
  action: ComposeAction,
  options?: { build?: boolean },
  hooks?: RestrictedStartAuditHooks & {
    composeUp?: typeof composeUp;
    composeStop?: typeof composeStop;
    composeRestart?: typeof composeRestart;
    composePs?: typeof composePs;
    auditStaffBindings?: typeof auditStaffPublishedBindings;
    inspectExistingAppDatabase?: typeof inspectExistingAppDatabase;
  },
): Promise<{ ok: boolean; log: string; compose: ComposeStatus }> {
  return runHostMutation(ctx.home, 'runComposeAction', async () => {
    const envPath = path.join(ctx.home, '.env');
    if (!fs.existsSync(envPath)) {
      throw new Error('ENV_MISSING');
    }
    const envMap = readEnvMap(envPath);
    assertHostLifecycleAction(
      ctx,
      action === 'start' ? 'stack-start' : action === 'stop' ? 'stack-stop' : 'stack-restart',
    );
    const runOptions = resolveComposeRunOptions(ctx);
    const runComposeUp = hooks?.composeUp ?? composeUp;
    const runComposeStop = hooks?.composeStop ?? composeStop;
    const runComposeRestart = hooks?.composeRestart ?? composeRestart;
    const runComposePs = hooks?.composePs ?? composePs;

    const start = async () => {
      const appImage =
        envMap.get('PRAXIS_FLOW_APP_IMAGE')?.trim() ||
        readManagerState(ctx.home).release?.appImage?.trim() ||
        (ctx.mode === 'repo' ? `${ctx.composeProjectName}-app` : '');
      const gate = await (hooks?.inspectExistingAppDatabase ?? inspectExistingAppDatabase)(
        ctx.composeProjectName,
        appImage,
      );
      if (!gate.ok) return { ok: false, log: installationStartFailureMessages[gate.code] };
      return runComposeUp({ ...runOptions, build: Boolean(options?.build) });
    };

    let result: { ok: boolean; log: string };
    if (action === 'start') {
      result = await start();
    } else if (action === 'stop') {
      result = await runComposeStop(runOptions);
    } else {
      const current = await runComposePs(runOptions);
      result = !current.running
        ? await start()
        : await runComposeRestart({
            ...runOptions,
            services: resolveProductComposeServices(runOptions),
          });
    }

    if (result.ok && action !== 'stop') await auditRestrictedStart(runOptions, hooks);
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
  });
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
    const compose = await composePs(resolveComposeRunOptions(ctx));
    const containerName = composeServiceContainerName(compose, 'sandbox');
    if (!containerName) return result;
    const log = await appendSandboxClamAvLogSection(result.log, containerName, options?.tail);
    return { ...result, log };
  }
  return result;
}

export {
  createPfbackup as backupPf,
  getPfbackupInfo,
  inspectPfbackup,
  restorePfbackup,
  applyPfupdate,
  inspectPfupdate,
};

export async function resetStaffPinsAndRestart(ctx: SetupContext): Promise<ResetStaffPinsResult> {
  return runHostMutation(ctx.home, 'resetStaffPinsAndRestart', async () => {
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
  });
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
  } catch (cause) {
    if (cause instanceof ManagerApiError) {
      throw cause;
    }
    throw new ManagerApiError(
      {
        code: 'compose_status_unavailable',
        category: 'unavailable',
        message: 'Der Containerstatus konnte nicht geprüft werden. Bitte erneut versuchen.',
        retryable: true,
      },
      { cause },
    );
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

function composeServiceContainerName(
  compose: ComposeStatus | null,
  serviceName: string,
): string | null {
  return (
    compose?.services.find((service) => (service.service || service.name) === serviceName)?.name ??
    null
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
  const lifecycle = readHostLifecycle(root, envMap, envExists);
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
  const sandboxContainerName = composeServiceContainerName(compose, 'sandbox');
  if (isSandboxServiceRunning(compose) && sandboxContainerName) {
    sandboxScanner = await fetchSandboxScannerStatus(
      resolveMaxSignatureAgeHours(envMap),
      sandboxContainerName,
    );
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
    lifecycleKey: hostLifecycleKey(lifecycle),
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
  const confirmed = readConfirmedHostConfig(root);
  const { env: envMap, envExists } = confirmed;
  const managerState = confirmed.unknown ? { release: null } : readManagerState(confirmed.root);
  const folders = resolveStorageFoldersFromSources({ envMap });
  const bindingOperation = readBindingOperationStatus(root);
  const updateOperation = readUpdateOperationStatus(root);
  const restoreOperation = readRestoreOperationStatus(root);
  const tlsOperation = readTlsOperationStatus(root);
  const docker = await detectDocker();
  const residues = envExists ? 'none' : await inspectLifecycleResidues(ctx, docker.daemonRunning);
  const lifecycle = readHostLifecycle(root, envMap, envExists, residues);
  if (confirmed.unknown) {
    lifecycle.assessment = 'unknown';
    lifecycle.mode = null;
    lifecycle.preparation = 'none';
    lifecycle.issues = [
      {
        code: 'confirmed-state-unknown',
        message: 'Die bestätigte Konfiguration kann aus dem offenen Vorgang nicht bestimmt werden.',
      },
    ];
  }
  const network = buildHostNetworkStatus(envMap);
  const configuredLanIp = network.configuredLanIp;
  const configuredCanonicalBaseUrl = parseHttpBaseUrl(envMap.get('CANONICAL_BASE_URL'));
  const canonicalBaseUrl = resolveCanonicalBaseUrl(envMap, configuredLanIp);
  const appBaseUrl = canonicalBaseUrl ?? fallbackCanonicalBaseUrl(configuredLanIp ?? '127.0.0.1');
  const deviceUrls: DeviceUrls | null = canonicalBaseUrl
    ? buildDeviceUrlsFromBaseUrl(canonicalBaseUrl)
    : null;

  // Runtime enrichment is optional. Configuration reads and durable diagnostics below
  // remain authoritative even when Compose or a subsequent runtime check fails.
  let compose: ComposeStatus | null;
  let probes: ProbeResult[] = [];
  let sandboxScanner: SandboxScannerStatus | null = null;
  let maintenance: Awaited<ReturnType<typeof inspectMaintenanceCompatibility>> = {
    authenticated: false,
    compatible: false,
    status: 'unreachable',
    settingsFormatVersion: null,
    stackVersion: null,
  };
  try {
    compose = await readComposeForHost(ctx, envExists, docker, envMap);
    if (includeProbes && shouldRunConnectionProbes(compose)) {
      probes = await runConnectionProbes({
        localAppBaseUrl: LOCAL_SETUP_APP_BASE_URL,
        lanAppBaseUrl: canonicalBaseUrl ?? undefined,
      });
    }
    const sandboxContainerName = composeServiceContainerName(compose, 'sandbox');
    if (includeSandboxScanner && isSandboxServiceRunning(compose) && sandboxContainerName) {
      sandboxScanner = await fetchSandboxScannerStatus(
        resolveMaxSignatureAgeHours(envMap),
        sandboxContainerName,
      );
    }
    if (coreInstallationServicesHealthy(compose)) {
      maintenance = await inspectMaintenanceCompatibility(LOCAL_MAINTENANCE_APP_BASE_URL);
    }
  } catch {
    // The runtime endpoint reports the failed observation; never synthesize a stopped stack.
    compose = null;
    probes = [];
    sandboxScanner = null;
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
  // A broken proxy configuration must still expose the diagnosis.
  let proxy;
  try {
    proxy = readProxyConfig(envMap);
  } catch {
    proxy = readProxyConfig(new Map());
  }
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
    release: managerState.release,
    ...(confirmed.unknown ? { localDeliveryImagePair: null } : {}),
    envMap,
    docker,
  });
  const settingsFormatVersion = maintenance.settingsFormatVersion;
  let activeInstallOperation;
  let installOperationReadError = false;
  try {
    const operation = readInstallOperation(root);
    activeInstallOperation = operation ? installOperationSummary(operation) : undefined;
  } catch {
    installOperationReadError = true;
  }
  const installation = deriveInstallationState({
    docker,
    lifecycle,
    compose,
    // Repository mode has no delivery release marker; installed products must have one.
    releaseConfigured: ctx.mode === 'repo' || managerState.release !== null,
    maintenanceStatus: maintenance.status,
    operation: activeInstallOperation,
    operationUnreadable: installOperationReadError,
  });

  return {
    lifecycle,
    lifecycleKey: hostLifecycleKey(lifecycle),
    bindingOperation,
    updateOperation,
    restoreOperation,
    tlsOperation,
    installation,
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
    tls: confirmed.unknown ? undefined : tls,
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

export async function startStoppedInstallation(
  ctx: SetupContext,
): Promise<InstallationStartResult> {
  return runHostMutation(ctx.home, 'startStoppedInstallation', async () => {
    const before = await getHostStatus(ctx);
    if (before.installation?.kind !== 'stopped') {
      throw new SetupApiValidationError(
        `Installation kann nur aus „stopped“ gestartet werden (aktuell: ${before.installation?.kind ?? 'nicht prüfbar'}).`,
      );
    }

    const env = readEnvMap(path.join(ctx.home, '.env'));
    const release = readManagerState(ctx.home).release;
    const appImage =
      env.get('PRAXIS_FLOW_APP_IMAGE')?.trim() ||
      release?.appImage?.trim() ||
      (ctx.mode === 'repo' ? `${ctx.composeProjectName}-app` : '');
    assertHostLifecycleAction(ctx, 'stack-start');
    const started = await startExistingInstallation(resolveComposeRunOptions(ctx), appImage);
    if (!started.ok) {
      return {
        installation: deriveInstallationState({
          docker: before.docker,
          lifecycle: before.lifecycle!,
          releaseConfigured: true,
          compose: started.compose,
          maintenanceStatus: started.maintenanceStatus,
          startFailure: started.code,
        }),
        compose: started.compose,
      };
    }

    const after = await getHostStatus(ctx);
    return { installation: after.installation, compose: after.compose };
  });
}

async function assertFreshInstallHost(ctx: SetupContext): Promise<void> {
  const envPath = path.join(ctx.home, '.env');
  const envExists = fs.existsSync(envPath);
  const lifecycle = readHostLifecycle(
    ctx.home,
    envExists ? readEnvMap(envPath) : new Map<string, string>(),
    envExists,
    await inspectLifecycleResidues(ctx, true),
  );
  if (lifecycle.assessment !== 'known' || lifecycle.mode !== 'uninstalled') {
    throw new SetupApiValidationError(
      'Der Host ist nicht mehr leer; Fresh-Commit wurde abgewiesen.',
    );
  }
}

export async function prepareInstallOperation(
  ctx: SetupContext,
  input: InstallPrepareInput,
): Promise<InstallPrepareResult> {
  return runHostMutation(ctx.home, 'prepareInstallOperation', async () => {
    if (readInstallOperation(ctx.home)) {
      throw new SetupApiValidationError('Es ist bereits ein Installationsvorgang aktiv.');
    }
    if (input.mode !== 'fresh' && input.mode !== 'replace') {
      throw new SetupApiValidationError('mode muss fresh oder replace sein.');
    }
    const docker = await detectDocker();
    if (!docker.installed || !docker.daemonRunning || !docker.composeAvailable) {
      throw new SetupApiValidationError('Docker ist für die Installation nicht verfügbar.');
    }
    // Replacing a broken installation must not depend on its old proxy configuration.
    if (input.mode === 'fresh') await assertFreshInstallHost(ctx);
    const prepared = await preparePfinstall(ctx.home, input.archivePath, input.mode, docker);
    if (input.backupCandidateId) {
      try {
        prepared.operation = attachInstallBackup(
          ctx.home,
          prepared.operation.id,
          pinRecoveryBackup(ctx.home, prepared.operation.id, input.backupCandidateId),
        );
      } catch (error) {
        abortPreparedInstallOperation(ctx.home, prepared.operation.id);
        throw error;
      }
    }
    return {
      operation: installOperationSummary(prepared.operation),
      loadedImages: prepared.loadedImages,
    };
  });
}

export async function commitPreparedInstallOperation(
  ctx: SetupContext,
  input: InstallCommitInput,
): Promise<InstallCommitResult> {
  return runHostMutation(ctx.home, 'commitPreparedInstallOperation', async () => {
    let operation = readInstallOperation(ctx.home);
    if (!operation || operation.id !== input.operationId) {
      throw new SetupApiValidationError(
        'Der vorbereitete Installationsvorgang wurde nicht gefunden.',
      );
    }
    const resetRequired = operation.mode === 'replace' || operation.phase === 'installing';
    if (resetRequired && input.replaceConfirmed !== true) {
      throw new SetupApiValidationError('Die Neuinstallation muss ausdrücklich bestätigt werden.');
    }
    const docker = await detectDocker();
    if (!docker.installed || !docker.daemonRunning || !docker.composeAvailable) {
      throw new SetupApiValidationError('Docker ist für die Installation nicht verfügbar.');
    }
    if (operation.phase === 'prepared' && operation.mode === 'fresh') {
      await assertFreshInstallHost(ctx);
    }

    if (operation.backup) readPinnedRecoveryBackup(ctx.home, operation);

    // Persist the destructive boundary before touching containers, volumes or live host files.
    operation = markInstallOperationInstalling(ctx.home, operation.id);
    if (resetRequired) {
      const staged = extractPreparedPfinstallTemplates(ctx.home, operation.id);
      try {
        await factoryResetInstallation(ctx, staged.templatesRoot);
      } finally {
        staged.cleanup();
      }
    }
    activatePreparedPfinstall(ctx.home, operation.id);
    const after = await getHostStatus(ctx);
    return {
      operation: installOperationSummary(operation),
      installation: after.installation,
    };
  });
}

export function abortInstallOperation(ctx: SetupContext, operationId: string): InstallAbortResult {
  hostMutationLock(ctx.home).assertAvailable();
  assertNoMaintenanceOperation(ctx.home);
  try {
    abortPreparedInstallOperation(ctx.home, operationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'INSTALL_OPERATION_NOT_FOUND') {
      throw new SetupApiValidationError(
        'Der vorbereitete Installationsvorgang wurde nicht gefunden.',
      );
    }
    if (message === 'INSTALL_OPERATION_ALREADY_INSTALLING') {
      throw new ManagerApiError({
        code: 'install_operation_already_running',
        category: 'conflict',
        message:
          'Der Installationsvorgang wurde bereits gestartet und kann nicht mehr abgebrochen werden.',
        retryable: false,
      });
    }
    throw error;
  }
  return { operationId, aborted: true };
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
  return runHostMutation(ctx.home, 'prepareRestrictedNetwork', async () => {
    const envPath = path.join(ctx.home, '.env');
    if (!fs.existsSync(envPath)) {
      throw new SetupApiValidationError('Setup muss vor dem Patientenzugang abgeschlossen sein.');
    }
    // Preparation persists the binding draft only. TLS/DNS and platform gates
    // below remain authoritative before anything is applied to Docker.
    assertHostLifecycleAction(ctx, 'network-binding');
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
        'restricted_address_unavailable',
      );
    }
    if (candidate.warnings.includes('ambiguous-address')) {
      throw new SetupApiValidationError(
        'Die gewählte Restricted-IP ist mehreren Interfaces zugeordnet und kann nicht eindeutig gebunden werden.',
        'restricted_address_ambiguous',
      );
    }
    if (candidate.warnings.length > 0 && !input.warningsConfirmed) {
      throw new SetupApiValidationError(
        'Die Hinweise zur gewählten Netzwerkadresse müssen bestätigt werden.',
      );
    }
    if (!restrictedPlatformSupported(deps.platform ?? process.platform)) {
      throw new SetupApiValidationError(
        restrictedPlatformMessage(deps.platform ?? process.platform),
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
  });
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
  assertHostLifecycleAction(ctx, enable ? 'restricted-apply' : 'restricted-remove');
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
        throw hostOperationError(
          'restricted_proxy_config_invalid',
          'Patientenzugang konnte nicht vorbereitet werden; die Proxy-Konfiguration ist ungültig.',
          error,
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
          try {
            const restoredEnv = readEnvMap(envPath);
            const restoredCompose = await runComposePs(operationOptions);
            const audit = await auditRuntimePostcondition(
              createRuntimePostcondition(restoredEnv, readInstalledPortalContract(ctx.home)),
              restoredCompose,
              { auditListeners: hooks.auditListeners, auditBindings: hooks.auditStaffBindings },
            );
            rollbackOk = audit.ok;
            if (!audit.ok) rollbackLog = [rollbackLog, ...audit.errors].filter(Boolean).join('\n');
          } catch (error) {
            rollbackOk = false;
            rollbackLog = [
              rollbackLog,
              `Rollback-Runtime-Audit: ${error instanceof Error ? error.message : String(error)}`,
            ]
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
      if (!rollbackOk) {
        try {
          const closed = await runComposeRemove({ ...operationOptions, withProxy: true }, [
            'proxy',
          ]);
          if (!closed.ok)
            rollbackLog += `\nUnsicherer Rollback-Proxy konnte nicht entfernt werden: ${closed.log}`;
        } catch (error) {
          rollbackLog += `\nUnsicherer Rollback-Proxy konnte nicht entfernt werden: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      if (rollbackOk) {
        if (stackWasRunning)
          await (hooks.restoreProxyRestartPolicy ?? restoreProxyRestartPolicy)(operationOptions);
        finish();
      }

      throw hostOperationError(
        rollbackOk ? 'restricted_apply_failed' : 'restricted_rollback_incomplete',
        rollbackOk
          ? 'Patientenzugang konnte nicht geändert werden. Der vorherige Patientenzugang wurde wiederhergestellt.'
          : 'Rollback unvollständig; Praxis Flow bis zur Prüfung nicht als sicher gebunden behandeln.',
        new Error([reason, rollbackLog].filter(Boolean).join('\n')),
        rollbackOk ? 'operation-failed' : 'inconsistent',
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
      throw hostOperationError(
        'restricted_compose_config_failed',
        'Patientenzugang konnte nicht vorbereitet werden; die Laufzeit blieb unverändert.',
        error,
      );
    }

    if (!configCheck.ok) {
      fs.copyFileSync(backup.backupPath, envPath);
      restoreCaddyfile();
      finish();
      throw hostOperationError(
        'restricted_compose_config_failed',
        'Patientenzugang konnte nicht vorbereitet werden; die Laufzeit blieb unverändert.',
        new Error(configCheck.log),
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
        const audit = await auditRuntimePostcondition(
          createRuntimePostcondition(currentEnv, readInstalledPortalContract(ctx.home)),
          await runComposePs(operationOptions),
          { auditListeners: hooks.auditListeners, auditBindings: hooks.auditStaffBindings },
        );
        if (!audit.ok) await rollback(audit.errors.join('\n'));
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
  return runHostMutation(ctx.home, 'applyRestrictedNetwork', async () => {
    return mutateRestrictedNetwork(ctx, true, hooks);
  });
}

export async function removeRestrictedNetwork(
  ctx: SetupContext,
  hooks: RestrictedNetworkMutationHooks = {},
): Promise<RestrictedNetworkInspectResult> {
  return runHostMutation(ctx.home, 'removeRestrictedNetwork', async () => {
    return mutateRestrictedNetwork(ctx, false, hooks);
  });
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
  return runHostMutation(ctx.home, 'applySetupPlan', async () => {
    const projectRoot = ctx.home;
    const envPathExisting = path.join(projectRoot, '.env');
    const installOperation = readInstallOperation(projectRoot);
    if (installOperation?.phase === 'prepared')
      throw new SetupApiValidationError('Installation zuerst bestätigen.');
    if (installOperation?.phase === 'installing') {
      // The confirmed install commit intentionally materializes a minimal target
      // env before the wizard writes its complete first configuration.
    } else if (fs.existsSync(envPathExisting)) {
      assertHostLifecycleAction(ctx, 'setup-apply');
    } else {
      const residues = hooks?.inspectLifecycleResidues
        ? await hooks.inspectLifecycleResidues()
        : await detectDocker().then((docker) =>
            inspectLifecycleResidues(ctx, docker.daemonRunning),
          );
      const lifecycle = readHostLifecycle(projectRoot, new Map(), false, residues);
      const decision = evaluateHostLifecycleAction(lifecycle, 'setup-apply');
      if (!decision.allowed) {
        throw new SetupApiValidationError(
          `Host-Aktion „setup-apply“ gesperrt: ${decision.reason ?? 'Lifecycle-Prüfung fehlgeschlagen.'}`,
        );
      }
    }
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
    const { proxy, writeEnv: writeProxyEnv } = resolveProxyForHostWrite(
      existingBefore,
      input.proxy,
    );
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

    return runBindingChange(
      ctx,
      Boolean(composeBeforeApply?.running),
      deliveryEarly,
      hooks,
      async (beginRuntime) => {
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
          await checkBindingPreflight(
            { ...runOptions, withGateway: input.gateway.enabled, withProxy: proxy.enabled },
            envAfterWrite,
            hooks,
          );
          beginRuntime();
          if (removeProxyAfterWrite) {
            const removed = await runComposeRemove({ ...runOptionsEarly, withProxy: true }, [
              'proxy',
            ]);
            if (!removed.ok) {
              throw new Error(removed.log || 'Proxy konnte nicht entfernt werden.');
            }
          }
          compose = await runComposeUp({
            ...runOptions,
            withGateway: input.gateway.enabled,
            withProxy: proxy.enabled,
            build: resolveComposeBuild({ ...input, delivery }),
          });
          if (!compose.ok) {
            throw new Error(compose.log);
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
            throw new Error(auditError);
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
      },
    );
  });
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
  return runHostMutation(ctx.home, 'loadDeliveryImages', async () => {
    const prepared = await prepareInstallOperation(ctx, {
      archivePath: input.archivePath,
      mode: 'fresh',
    });
    await commitPreparedInstallOperation(ctx, { operationId: prepared.operation.id });
    const operation = readInstallOperation(ctx.home);
    if (!operation || operation.id !== prepared.operation.id) {
      throw new Error('INSTALL_OPERATION_NOT_FOUND_AFTER_COMMIT');
    }

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

    const status = await getHostStatus(ctx);
    const appImage = `praxis-flow/app:${operation.package.releaseVersion}`;
    const sandboxImage = `praxis-flow/sandbox:${operation.package.releaseVersion}`;

    return {
      envPath: path.join(ctx.home, '.env'),
      backupPath: null,
      loadedImages: prepared.loadedImages,
      appImage,
      sandboxImage,
      deliveryImages: status.deliveryImages,
      sha256Verified: true,
      sha256: operation.package.sha256,
      releaseVersion: operation.package.releaseVersion,
      sha256Source: 'manifest.json',
      composeRestarted,
      compose,
      restartLog,
    };
  });
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
  return runHostMutation(ctx.home, 'saveHostNetwork', async () => {
    const envPath = path.join(ctx.home, '.env');
    if (!fs.existsSync(envPath)) {
      throw new Error('ENV_MISSING');
    }
    assertHostLifecycleAction(ctx, 'network-binding');

    const lanAppIp = input.lanAppIp.trim();
    const gateway: GatewayPlan = {
      ...input.gateway,
      portalAppIp: input.gateway.portalAppIp.trim() || lanAppIp,
    };
    const existing = readEnvMap(envPath);
    const runOptions = resolveComposeRunOptions(ctx);
    const runComposePs = hooks?.composePs ?? composePs;
    const runComposeRemove = hooks?.composeRemoveServices ?? composeRemoveServices;
    const runComposeUp = hooks?.composeUp ?? composeUp;
    const composeBefore = await runComposePs(runOptions);
    const stackWasRunning = composeBefore.running;
    const repairProxy = Boolean(input.repairProxy);

    const { proxy, writeEnv: writeProxyEnv } = resolveProxyForHostWrite(existing, input.proxy);

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

    return runBindingChange(
      ctx,
      stackWasRunning,
      runOptions.delivery,
      hooks,
      async (beginRuntime) => {
        const backup = backupEnvFile(ctx.home);
        const { keysWritten } = updateEnvKeys(envPath, updates);
        if (!gateway.enabled) {
          const { keysRemoved } = removeEnvKeys(envPath, [...GATEWAY_ENV_KEYS]);
          keysWritten.push(...keysRemoved);
        }

        const envAfter = readEnvMap(envPath);
        if (shouldComposeUp || proxyActions.removeProxyFirst) {
          await checkBindingPreflight(
            {
              ...resolveComposeRunOptions(ctx),
              withGateway: gateway.enabled,
              withProxy: proxy.enabled,
            },
            envAfter,
            hooks,
          );
        }
        if (shouldComposeUp || proxyActions.removeProxyFirst) beginRuntime();
        if (proxyActions.removeProxyFirst) {
          const removed = await runComposeRemove({ ...runOptions, withProxy: true }, ['proxy']);
          restartLog = removed.log || null;
          if (!removed.ok) {
            throw new Error(removed.log || 'Proxy konnte nicht entfernt werden.');
          }
        }

        if (shouldComposeUp) {
          const up = await runComposeUp({
            ...resolveComposeRunOptions(ctx),
            build: false,
            withGateway: gateway.enabled,
            withProxy: proxy.enabled,
          });
          if (!up.ok) {
            throw new Error(up.log);
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
            throw new Error(auditError);
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
      },
    );
  });
}

export async function saveStorageFolders(
  ctx: SetupContext,
  input: StorageFoldersInput,
): Promise<StorageFoldersResult> {
  return runHostMutation(ctx.home, 'saveStorageFolders', async () => {
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
  });
}
