import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';

export type ManagerView = 'status' | 'maintenance' | 'network' | 'wizard';

export type RefreshScope = 'full' | 'runtime';

export type RefreshOptions = {
  scope: RefreshScope;
  /** Poll / background — errors are ignored. */
  silent?: boolean;
  /** Queue after any in-flight refresh (default for user actions). */
  immediate?: boolean;
};

export type ScheduleFn = (callback: () => void, delayMs: number) => unknown;
export type ClearScheduleFn = (id: unknown) => void;

export type HostRefreshControllerDeps = {
  api: () => PraxisManagerApi;
  pollIntervalMs?: number;
  onRuntime: (runtime: HostRuntimeHealth) => void;
  onConfig: (status: HostStatus, view: ManagerView) => void;
  onError: (message: string, view: ManagerView) => void;
  schedule?: ScheduleFn;
  clearSchedule?: ClearScheduleFn;
};

export type HostRefreshController = {
  getView(): ManagerView;
  setView(view: ManagerView): void;
  refresh(options: RefreshOptions): Promise<void>;
  getLastConfig(): HostStatus | null;
  getLastRuntime(): HostRuntimeHealth | null;
};

const DEFAULT_POLL_MS = 12_000;

export function createHostRefreshController(deps: HostRefreshControllerDeps): HostRefreshController {
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_MS;
  const schedule: ScheduleFn =
    deps.schedule ??
    ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
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

  function stopPollTimer(): void {
    if (pollTimerId !== null) {
      clearSchedule(pollTimerId);
      pollTimerId = null;
    }
  }

  function shouldPoll(view: ManagerView): boolean {
    return view !== 'wizard';
  }

  function schedulePollTimer(myGeneration: number): void {
    stopPollTimer();
    if (!shouldPoll(currentView) || myGeneration !== generation) {
      return;
    }
    pollTimerId = schedule(() => {
      pollTimerId = null;
      void refresh({ scope: 'runtime', silent: true });
    }, pollIntervalMs);
  }

  async function performRefresh(myGeneration: number, options: RefreshOptions): Promise<void> {
    try {
      if (options.scope === 'full') {
        const [status, runtime] = await Promise.all([
          deps.api().fetchSetupStatus(),
          deps.api().fetchRuntimeHealth(),
        ]);
        if (myGeneration !== generation) {
          return;
        }
        lastConfig = status;
        lastRuntime = runtime;
        deps.onRuntime(runtime);
        deps.onConfig(status, currentView);
        return;
      }

      const runtime = await deps.api().fetchRuntimeHealth();
      if (myGeneration !== generation) {
        return;
      }
      lastRuntime = runtime;
      deps.onRuntime(runtime);
    } catch (error) {
      if (options.silent) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Setup-API nicht erreichbar — bitte Manager neu starten.';
      deps.onError(message, currentView);
    } finally {
      if (myGeneration === generation && shouldPoll(currentView)) {
        schedulePollTimer(myGeneration);
      }
    }
  }

  function refresh(options: RefreshOptions): Promise<void> {
    stopPollTimer();
    const myGeneration = ++generation;

    refreshChain = refreshChain
      .then(async () => {
        await performRefresh(myGeneration, options);
      })
      .catch(() => {
        // Errors are handled in performRefresh; keep the chain alive.
      });

    return refreshChain;
  }

  return {
    getView(): ManagerView {
      return currentView;
    },
    setView(view: ManagerView): void {
      currentView = view;
      if (view === 'wizard') {
        stopPollTimer();
        ++generation;
        return;
      }
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
