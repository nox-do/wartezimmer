import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { ComposeStatus, HostStatus, RoutingMode } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { pickAndLoadReleaseArchive } from './delivery-images-flow.js';
import {
  PIN_RESET_PROGRESS_TEXT,
  ROUTING_MODE_SAVE_PROGRESS_TEXT,
  SOFTWARE_UPDATE_CONFIRM_MESSAGE,
  SOFTWARE_UPDATE_LOADING_TEXT,
  STACK_OFFLINE_CONFIRM_MESSAGE,
  STORAGE_PATHS_RESTART_CONFIRM_MESSAGE,
  STORAGE_PATHS_VALIDATION_ERROR,
  STORAGE_SAVE_PROGRESS_TEXT,
  composeActionErrorMessage,
  pinResetSuccessText,
  routingModeSuccessText,
  softwareUpdateErrorText,
  softwareUpdateStatusText,
  storagePathsChanged,
  storageSaveErrorText,
  storageSaveStatusText,
} from './maintenance-view-model.js';
import { formatRoutingModeError } from './routing-mode-ui.js';

export type MaintenanceCallbacks = {
  onAfterMutation?: () => void;
};

export type MaintenanceState = {
  status: HostStatus | null;
  compose: ComposeStatus | null;
  logsService: string;
  logsText: string;
  latestBackupPath: string | null;
  importsHostPath: string;
  exportsHostPath: string;
  storageStatusText: string;
  softwareUpdateStatusText: string;
  /** null until getRoutingMode() hydrates — never show a fake default. */
  routingMode: RoutingMode | null;
  routingModeSaved: RoutingMode | null;
  complexRoutingLicensed: boolean;
  openVisitCount: number;
  routingModeStatusText: string;
  pinResetStatusText: string;
  busy: boolean;
  error: string | null;
};

export type MaintenanceControllerDeps = MaintenanceCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
  requestConfirm: (message: string, onConfirm: () => void) => void;
};

export type MaintenanceController = {
  getState: () => Readonly<MaintenanceState>;
  subscribe: (listener: () => void) => () => void;
  setImportsPath: (value: string) => void;
  setExportsPath: (value: string) => void;
  setRoutingMode: (routingMode: RoutingMode) => void;
  browseImportsFolder: () => Promise<string | null>;
  browseExportsFolder: () => Promise<string | null>;
  handleStackToggle: (wantRunning: boolean) => void;
  restartBuild: () => void;
  restart: () => void;
  refreshLogs: (service?: string) => Promise<void>;
  requestLogsRefresh: (service?: string) => void;
  backupEnv: () => void;
  applyStorage: () => void;
  importSoftware: () => void;
  saveRoutingMode: () => void;
  executePinReset: () => void;
  applyRuntimeHealth: (health: HostRuntimeHealth) => void;
  applyConfigSnapshot: (status: HostStatus) => void;
  show: (status: HostStatus) => void;
  clearError: () => void;
};

function createInitialState(): MaintenanceState {
  return {
    status: null,
    compose: null,
    logsService: 'app',
    logsText: '',
    latestBackupPath: null,
    importsHostPath: '',
    exportsHostPath: '',
    storageStatusText: '',
    softwareUpdateStatusText: '',
    routingMode: null,
    routingModeSaved: null,
    complexRoutingLicensed: true,
    openVisitCount: 0,
    routingModeStatusText: '',
    pinResetStatusText: '',
    busy: false,
    error: null,
  };
}

export function createMaintenanceController(
  deps: MaintenanceControllerDeps,
): MaintenanceController {
  const state = createInitialState();
  const listeners = new Set<() => void>();

  function notify(): void {
    deps.onStateChange?.();
    for (const listener of listeners) {
      listener();
    }
  }

  function patch(partial: Partial<MaintenanceState>, options: { notify?: boolean } = {}): void {
    Object.assign(state, partial);
    if (options.notify !== false) {
      notify();
    }
  }

  function setBusy(busy: boolean): void {
    patch({ busy });
  }

  function setError(message: string | null): void {
    patch({ error: message });
  }

  function pathsChanged(): boolean {
    return storagePathsChanged(state.importsHostPath, state.exportsHostPath, state.status?.folders);
  }

  async function refreshLogs(service?: string): Promise<void> {
    const logsService = service ?? state.logsService;
    patch({ logsService });
    const result = await deps.api.getComposeLogs(logsService, 200);
    patch({ logsText: result.log });
  }

  async function runAction(action: 'start' | 'stop' | 'restart', build = false): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await deps.api.runComposeAction(action, build);
      patch({ compose: result.compose });
      if (!result.ok) {
        setError(composeActionErrorMessage(action, result.log));
      }
      if (action !== 'stop') {
        await refreshLogs();
      }
      deps.onAfterMutation?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : `Aktion „${action}“ fehlgeschlagen.`);
    } finally {
      setBusy(false);
    }
  }

  function saveStorageFolders(restartCompose: boolean): void {
    const importsHostPath = state.importsHostPath.trim();
    const exportsHostPath = state.exportsHostPath.trim();
    if (!importsHostPath || !exportsHostPath) {
      setError(STORAGE_PATHS_VALIDATION_ERROR);
      return;
    }

    setBusy(true);
    setError(null);
    patch({ storageStatusText: STORAGE_SAVE_PROGRESS_TEXT });

    void deps.api
      .saveStorageFolders({
        importsHostPath,
        exportsHostPath,
        restartCompose,
      })
      .then((result) => {
        const nextStatus = state.status
          ? { ...state.status, folders: result.folders }
          : state.status;
        patch({
          importsHostPath: result.folders.imports,
          exportsHostPath: result.folders.exports,
          status: nextStatus,
          latestBackupPath: result.backupPath,
          compose: result.compose ?? state.compose,
          storageStatusText: storageSaveStatusText(result, restartCompose),
        });
        const storageError = storageSaveErrorText(result, restartCompose);
        if (storageError) {
          setError(storageError);
        }
        deps.onAfterMutation?.();
      })
      .catch((error) => {
        patch({ storageStatusText: '' });
        setError(error instanceof Error ? error.message : 'Speichern der Ordner fehlgeschlagen.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  function runSoftwareUpdate(restartCompose: boolean): void {
    setBusy(true);
    setError(null);
    patch({ softwareUpdateStatusText: SOFTWARE_UPDATE_LOADING_TEXT });

    void pickAndLoadReleaseArchive(deps.api, {
      restartCompose,
      loadingMessage: SOFTWARE_UPDATE_LOADING_TEXT,
      onProgress: (progress) => {
        if (progress.phase === 'loading') {
          patch({ softwareUpdateStatusText: progress.statusText });
        }
      },
    })
      .then(async (pickResult) => {
        if (pickResult.canceled) {
          patch({ softwareUpdateStatusText: '' });
          return;
        }
        if (!pickResult.ok || !pickResult.result) {
          patch({ softwareUpdateStatusText: '' });
          if (pickResult.error) {
            setError(pickResult.error);
          }
          return;
        }

        const result = pickResult.result;
        const nextStatus = state.status
          ? {
              ...state.status,
              envExists: true,
              deliveryImages: result.deliveryImages,
              compose: result.compose ?? state.status.compose,
            }
          : state.status;
        patch({
          status: nextStatus,
          compose: result.compose ?? state.compose,
          softwareUpdateStatusText: softwareUpdateStatusText(result, restartCompose),
        });
        const updateError = softwareUpdateErrorText(result, restartCompose);
        if (updateError) {
          setError(updateError);
        }
        deps.onAfterMutation?.();
        if (restartCompose && result.composeRestarted) {
          await refreshLogs();
        }
      })
      .catch((error) => {
        patch({ softwareUpdateStatusText: '' });
        setError(
          error instanceof Error
            ? error.message
            : 'Software-Update konnte nicht importiert werden.',
        );
      })
      .finally(() => setBusy(false));
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setImportsPath(value) {
      patch({ importsHostPath: value }, { notify: false });
    },
    setExportsPath(value) {
      patch({ exportsHostPath: value }, { notify: false });
    },
    setRoutingMode(routingMode) {
      patch({ routingMode });
    },
    async browseImportsFolder() {
      const result = await deps.api.selectFolder(state.importsHostPath.trim() || undefined);
      if (!result.canceled && result.path) {
        patch({ importsHostPath: result.path });
        return result.path;
      }
      return null;
    },
    async browseExportsFolder() {
      const result = await deps.api.selectFolder(state.exportsHostPath.trim() || undefined);
      if (!result.canceled && result.path) {
        patch({ exportsHostPath: result.path });
        return result.path;
      }
      return null;
    },
    handleStackToggle(wantRunning) {
      if (wantRunning) {
        void runAction('start');
        return;
      }
      deps.requestConfirm(STACK_OFFLINE_CONFIRM_MESSAGE, () => {
        void runAction('stop');
      });
    },
    restartBuild() {
      void runAction('restart', true);
    },
    restart() {
      deps.requestConfirm(STACK_OFFLINE_CONFIRM_MESSAGE, () => {
        void runAction('restart');
      });
    },
    refreshLogs,
    requestLogsRefresh(service) {
      setBusy(true);
      void refreshLogs(service)
        .catch((error) => {
          setError(error instanceof Error ? error.message : 'Logs konnten nicht geladen werden.');
        })
        .finally(() => setBusy(false));
    },
    backupEnv() {
      setBusy(true);
      setError(null);
      void deps.api
        .backupEnv()
        .then(async (result) => {
          patch({ latestBackupPath: result.backupPath });
          const saveResult = await deps.api.saveEnvBackup(result.backupPath);
          if (!saveResult.canceled && !saveResult.saved) {
            setError('Download fehlgeschlagen.');
          }
        })
        .catch((error) => {
          setError(error instanceof Error ? error.message : '.env-Backup fehlgeschlagen.');
        })
        .finally(() => setBusy(false));
    },
    applyStorage() {
      if (!state.importsHostPath.trim() || !state.exportsHostPath.trim()) {
        setError(STORAGE_PATHS_VALIDATION_ERROR);
        return;
      }

      if ((state.compose?.running ?? false) && pathsChanged()) {
        deps.requestConfirm(STORAGE_PATHS_RESTART_CONFIRM_MESSAGE, () => saveStorageFolders(true));
        return;
      }

      saveStorageFolders(false);
    },
    importSoftware() {
      const stackRunning = state.compose?.running ?? false;
      const proceed = () => runSoftwareUpdate(stackRunning);

      if (stackRunning) {
        deps.requestConfirm(SOFTWARE_UPDATE_CONFIRM_MESSAGE, proceed);
        return;
      }

      proceed();
    },
    saveRoutingMode() {
      if (!state.routingMode) {
        setError('Routing-Modus ist noch nicht geladen.');
        return;
      }
      const routingMode = state.routingMode;
      setBusy(true);
      setError(null);
      patch({ routingModeStatusText: ROUTING_MODE_SAVE_PROGRESS_TEXT });
      void deps.api
        .setRoutingMode({ routingMode })
        .then((result) => {
          if (!result.ok) {
            patch({ routingModeStatusText: '' });
            setError(formatRoutingModeError(result));
            return;
          }
          patch({
            routingMode: result.routingMode,
            routingModeSaved: result.routingMode,
            complexRoutingLicensed: result.features.complexRoutingLicensed,
            openVisitCount: 0,
            routingModeStatusText: routingModeSuccessText(result.routingMode),
          });
          deps.onAfterMutation?.();
        })
        .catch((error) => {
          patch({ routingModeStatusText: '' });
          setError(
            error instanceof Error
              ? error.message
              : 'Routing-Modus konnte nicht gespeichert werden.',
          );
        })
        .finally(() => setBusy(false));
    },
    executePinReset() {
      setBusy(true);
      setError(null);
      patch({ pinResetStatusText: PIN_RESET_PROGRESS_TEXT });
      void deps.api
        .resetStaffPins()
        .then((result) => {
          patch({ compose: result.compose });
          if (result.ok) {
            patch({ pinResetStatusText: pinResetSuccessText(result.defaultPin) });
            void refreshLogs();
            deps.onAfterMutation?.();
          } else {
            patch({ pinResetStatusText: '' });
            setError(result.log || 'PIN-Reset fehlgeschlagen.');
          }
        })
        .catch((error) => {
          patch({ pinResetStatusText: '' });
          setError(error instanceof Error ? error.message : 'PIN-Reset fehlgeschlagen.');
        })
        .finally(() => setBusy(false));
    },
    applyRuntimeHealth(health) {
      patch({ compose: health.compose });
    },
    applyConfigSnapshot(status) {
      const next: Partial<MaintenanceState> = { status };
      if (!state.busy) {
        next.importsHostPath = status.folders.imports;
        next.exportsHostPath = status.folders.exports;
      }
      patch(next);
    },
    show(status) {
      patch({
        status,
        compose: status.compose,
        logsService: 'app',
        logsText: '',
        latestBackupPath: null,
        importsHostPath: status.folders.imports,
        exportsHostPath: status.folders.exports,
        storageStatusText: '',
        softwareUpdateStatusText: '',
        routingModeStatusText: '',
        pinResetStatusText: '',
        error: null,
      });

      setBusy(true);
      void Promise.all([refreshLogs('app'), deps.api.getEnvBackupInfo(), deps.api.getRoutingMode()])
        .then(([, backupInfoResult, routingCapabilities]) => {
          patch({
            latestBackupPath: backupInfoResult.latestBackupPath,
            routingMode: routingCapabilities.routingMode,
            routingModeSaved: routingCapabilities.routingMode,
            complexRoutingLicensed: routingCapabilities.features.complexRoutingLicensed,
            openVisitCount: Number(routingCapabilities.openVisitCount ?? 0),
          });
        })
        .catch((error) => {
          setError(
            error instanceof Error ? error.message : 'Wartungsdaten konnten nicht geladen werden.',
          );
        })
        .finally(() => setBusy(false));
    },
    clearError() {
      setError(null);
    },
  };
}
