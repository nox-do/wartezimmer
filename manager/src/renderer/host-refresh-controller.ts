import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';

export type ManagerView = 'status' | 'maintenance' | 'network' | 'wizard';

export type RefreshScope = 'full' | 'runtime' | 'config';

export type RefreshErrorSource = 'config' | 'runtime';

export type RefreshOptions = {
  scope: RefreshScope;
  /** Poll / background — errors are ignored. */
  silent?: boolean;
};

export type ScheduleFn = (callback: () => void, delayMs: number) => unknown;
export type ClearScheduleFn = (id: unknown) => void;

export type HostRefreshControllerDeps = {
  api: () => PraxisManagerApi;
  pollIntervalMs?: number;
  onRuntime: (runtime: HostRuntimeHealth) => void;
  onConfig: (status: HostStatus, view: ManagerView) => void;
  onError: (message: string, view: ManagerView, source: RefreshErrorSource) => void;
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

  function envExistsForRuntime(): boolean {
    return lastConfig?.envExists === true;
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
    if (!envExistsForRuntime()) {
      return;
    }
    pollTimerId = schedule(() => {
      pollTimerId = null;
      void refresh({ scope: 'runtime', silent: true });
    }, pollIntervalMs);
  }

  function reportError(options: RefreshOptions, source: RefreshErrorSource, error: unknown): void {
    if (options.silent) {
      return;
    }
    deps.onError(errorMessage(error), currentView, source);
  }

  async function fetchConfig(
    myGeneration: number,
    options: RefreshOptions,
  ): Promise<HostStatus | null> {
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
      reportError(options, 'config', error);
      return null;
    }
  }

  async function fetchRuntime(myGeneration: number, options: RefreshOptions): Promise<void> {
    try {
      const runtime = await deps.api().fetchRuntimeHealth();
      if (myGeneration !== generation) {
        return;
      }
      lastRuntime = runtime;
      deps.onRuntime(runtime);
    } catch (error) {
      if (myGeneration !== generation) {
        return;
      }
      reportError(options, 'runtime', error);
    }
  }

  async function performRefresh(
    myGeneration: number,
    options: RefreshOptions,
  ): Promise<HostStatus | null> {
    let configSucceeded = false;
    try {
      if (options.scope === 'config') {
        const status = await fetchConfig(myGeneration, options);
        configSucceeded = status !== null;
        return status;
      }

      if (options.scope === 'full') {
        if (!envExistsForRuntime()) {
          const status = await fetchConfig(myGeneration, options);
          configSucceeded = status !== null;
          return status;
        }
        let configResult: HostStatus | null = null;
        await Promise.all([
          fetchRuntime(myGeneration, options),
          fetchConfig(myGeneration, options).then((status) => {
            configResult = status;
          }),
        ]);
        return configResult;
      }

      if (envExistsForRuntime()) {
        await fetchRuntime(myGeneration, options);
      }
      return lastConfig;
    } finally {
      if (myGeneration === generation && envExistsForRuntime()) {
        // Successful config-only: caller starts runtime (boot / mutation). Failed
        // config-only must resume an existing ops poll — refresh() already stopped it.
        if (!(options.scope === 'config' && configSucceeded)) {
          schedulePollTimer(myGeneration);
        }
      }
    }
  }

  function refresh(options: RefreshOptions): Promise<HostStatus | null> {
    stopPollTimer();
    const myGeneration = ++generation;

    const done = refreshChain
      .then(async () => performRefresh(myGeneration, options))
      .catch(() => null);
    refreshChain = done.then(() => undefined);

    return done;
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
