import { hasBlockingMaintenanceOperation } from '@praxis-flow/server-shared/manager-status-projection';
import type { ManagerError } from '@praxis-flow/server-shared/setup-api';
import { managerRefreshError } from './runtime-observation.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';

export type ManagerView = 'status' | 'maintenance' | 'network' | 'wizard';

export type RefreshScope = 'full' | 'runtime' | 'config' | 'mutation';

export type RefreshErrorSource = 'config' | 'runtime';

export type RefreshOptions = {
  scope: RefreshScope;
  /** Poll / background — keeps foreground refresh sequencing independent. */
  silent?: boolean;
};

export type ScheduleFn = (callback: () => void, delayMs: number) => unknown;
export type ClearScheduleFn = (id: unknown) => void;

export type HostRefreshControllerDeps = {
  api: () => PraxisManagerApi;
  pollIntervalMs?: number;
  onRuntime: (runtime: HostRuntimeHealth) => void;
  onConfig: (status: HostStatus, view: ManagerView) => void;
  onError: (
    message: string,
    view: ManagerView,
    source: RefreshErrorSource,
    error: ManagerError,
  ) => void;
  schedule?: ScheduleFn;
  clearSchedule?: ClearScheduleFn;
};

export type HostRefreshController = {
  getView(): ManagerView;
  setView(view: ManagerView): void;
  refresh(options: RefreshOptions): Promise<HostStatus | null>;
  getLastConfig(): HostStatus | null;
  getLastRuntime(): HostRuntimeHealth | null;
};

const DEFAULT_POLL_MS = 12_000;

const SETUP_UNREACHABLE = 'Setup-API nicht erreichbar — bitte Manager neu starten.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : SETUP_UNREACHABLE;
}

export function createHostRefreshController(
  deps: HostRefreshControllerDeps,
): HostRefreshController {
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_MS;
  const schedule: ScheduleFn =
    deps.schedule ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const clearSchedule: ClearScheduleFn =
    deps.clearSchedule ??
    ((id) => {
      globalThis.clearTimeout(id as ReturnType<typeof setTimeout>);
    });

  let currentView: ManagerView = 'status';
  let generation = 0;
  let refreshChain: Promise<void> = Promise.resolve();
  let pollTimerId: unknown = null;
  let lastConfig: HostStatus | null = null;
  let lastRuntime: HostRuntimeHealth | null = null;
  let foregroundRefreshes = 0;

  function envExistsForRuntime(): boolean {
    return (lastConfig?.envExists ?? lastRuntime?.envExists) === true;
  }

  function shouldPoll(): boolean {
    return envExistsForRuntime() || hasBlockingMaintenanceOperation(lastConfig);
  }

  function stopPollTimer(): void {
    if (pollTimerId !== null) {
      clearSchedule(pollTimerId);
      pollTimerId = null;
    }
  }

  function schedulePollTimer(myGeneration: number): void {
    stopPollTimer();
    if (myGeneration !== generation) {
      return;
    }
    if (!shouldPoll()) {
      return;
    }
    pollTimerId = schedule(() => {
      pollTimerId = null;
      void refresh({ scope: 'runtime', silent: true });
    }, pollIntervalMs);
  }

  function reportError(source: RefreshErrorSource, error: unknown): void {
    deps.onError(errorMessage(error), currentView, source, managerRefreshError(error));
  }

  async function fetchConfig(myGeneration: number): Promise<HostStatus | null> {
    try {
      const status = await deps.api().fetchSetupStatus();
      if (myGeneration !== generation) {
        return null;
      }
      lastConfig = status;
      deps.onConfig(status, currentView);
      return status;
    } catch (error) {
      if (myGeneration !== generation) {
        return null;
      }
      reportError('config', error);
      return null;
    }
  }

  async function fetchRuntime(myGeneration: number): Promise<boolean> {
    try {
      const runtime = await deps.api().fetchRuntimeHealth();
      if (myGeneration !== generation) {
        return false;
      }
      lastRuntime = runtime;
      deps.onRuntime(runtime);
      return true;
    } catch (error) {
      if (myGeneration !== generation) {
        return false;
      }
      reportError('runtime', error);
      return false;
    }
  }

  function runtimeDiffersFromConfig(): boolean {
    if (!lastConfig || !lastRuntime) return false;
    return (
      (lastRuntime.lifecycleKey !== undefined &&
        lastRuntime.lifecycleKey !== lastConfig.lifecycleKey) ||
      lastRuntime.envExists !== lastConfig.envExists ||
      lastRuntime.docker.daemonRunning !== lastConfig.docker.daemonRunning ||
      JSON.stringify(
        lastRuntime.compose?.services.map((service) => [
          service.service,
          service.state,
          service.health,
        ]),
      ) !==
        JSON.stringify(
          lastConfig.compose?.services.map((service) => [
            service.service,
            service.state,
            service.health,
          ]),
        ) ||
      lastRuntime.configuredLanIp !== lastConfig.network.configuredLanIp ||
      (lastRuntime.appBaseUrl !== null && lastRuntime.appBaseUrl !== lastConfig.appBaseUrl) ||
      (lastRuntime.proxyServer !== null &&
        lastRuntime.proxyServer.enabled !== lastConfig.proxy.enabled)
    );
  }

  async function reconcileConfigAfterRuntime(
    myGeneration: number,
    runtimeSucceeded: boolean,
  ): Promise<HostStatus | null> {
    if (
      runtimeSucceeded &&
      myGeneration === generation &&
      (hasBlockingMaintenanceOperation(lastConfig) || runtimeDiffersFromConfig())
    ) {
      return fetchConfig(myGeneration);
    }
    return lastConfig;
  }

  async function performRefresh(
    myGeneration: number,
    options: RefreshOptions,
  ): Promise<HostStatus | null> {
    let configSucceeded = false;
    try {
      if (options.scope === 'config') {
        const status = await fetchConfig(myGeneration);
        configSucceeded = status !== null;
        return status;
      }

      if (options.scope === 'mutation') {
        const status = await fetchConfig(myGeneration);
        configSucceeded = status !== null;
        if (myGeneration === generation && status?.envExists !== false) {
          const runtimeSucceeded = await fetchRuntime(myGeneration);
          return (await reconcileConfigAfterRuntime(myGeneration, runtimeSucceeded)) ?? status;
        }
        return status;
      }

      if (options.scope === 'full') {
        if (!envExistsForRuntime()) {
          const status = await fetchConfig(myGeneration);
          configSucceeded = status !== null;
          if (myGeneration === generation && status?.envExists !== false) {
            const runtimeSucceeded = await fetchRuntime(myGeneration);
            return (await reconcileConfigAfterRuntime(myGeneration, runtimeSucceeded)) ?? status;
          }
          return status;
        }
        let configResult: HostStatus | null = null;
        const [runtimeSucceeded] = await Promise.all([
          fetchRuntime(myGeneration),
          fetchConfig(myGeneration).then((status) => {
            configResult = status;
          }),
        ]);
        return (await reconcileConfigAfterRuntime(myGeneration, runtimeSucceeded)) ?? configResult;
      }

      if (envExistsForRuntime()) {
        const runtimeSucceeded = await fetchRuntime(myGeneration);
        // A runtime poll may supersede a mutation's config refresh. Reconcile by
        // fetching authoritative config, never by mixing runtime fields into it.
        await reconcileConfigAfterRuntime(myGeneration, runtimeSucceeded);
      } else if (hasBlockingMaintenanceOperation(lastConfig)) {
        await fetchConfig(myGeneration);
      }
      return lastConfig;
    } finally {
      if (myGeneration === generation && shouldPoll()) {
        // Boot callers start runtime after config. Open journals must also poll
        // without an env (e.g. interrupted first setup); failed config resumes polling.
        if (
          !(
            options.scope === 'config' &&
            configSucceeded &&
            !hasBlockingMaintenanceOperation(lastConfig)
          )
        ) {
          schedulePollTimer(myGeneration);
        }
      }
    }
  }

  function refresh(options: RefreshOptions): Promise<HostStatus | null> {
    stopPollTimer();

    // A poll whose timer fired just before a user-triggered mutation refresh was
    // stopped must not invalidate that authoritative config response. Waiting for
    // the foreground chain is sufficient: its caller starts the next runtime
    // refresh, and full foreground refreshes schedule the next poll themselves.
    if (options.scope === 'runtime' && options.silent && foregroundRefreshes > 0) {
      return refreshChain.then(() => lastConfig);
    }

    const foreground = !options.silent;
    if (foreground) {
      foregroundRefreshes += 1;
    }
    const myGeneration = ++generation;

    const done = refreshChain
      .then(async () => performRefresh(myGeneration, options))
      .catch(() => null);
    const finalized = done.finally(() => {
      if (foreground) {
        foregroundRefreshes -= 1;
      }
    });
    refreshChain = finalized.then(() => undefined);

    return finalized;
  }

  return {
    getView(): ManagerView {
      return currentView;
    },
    setView(view: ManagerView): void {
      currentView = view;
    },
    refresh,
    getLastConfig(): HostStatus | null {
      return lastConfig;
    },
    getLastRuntime(): HostRuntimeHealth | null {
      return lastRuntime;
    },
  };
}
