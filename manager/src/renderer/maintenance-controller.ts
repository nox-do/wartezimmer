import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { ComposeStatus, HostStatus, RoutingMode } from '../shared/host-status.js';
import type { PfupdateApplyResult } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { formatPfupdateSuccess } from './pfupdate-flow.js';
import {
  PIN_RESET_PROGRESS_TEXT,
  ROUTING_MODE_SAVE_PROGRESS_TEXT,
  STACK_OFFLINE_CONFIRM_MESSAGE,
  STORAGE_PATHS_RESTART_CONFIRM_MESSAGE,
  STORAGE_PATHS_VALIDATION_ERROR,
  STORAGE_SAVE_PROGRESS_TEXT,
  composeActionErrorMessage,
  pinResetSuccessText,
  routingModeSuccessText,
  pfbackupValidateSuccessText,
  pfbackupArchiveOnlyValidText,
  storagePathsChanged,
  storageSaveErrorText,
  storageSaveStatusText,
} from './maintenance-view-model.js';
import {
  restoreInspectBlockedMessage,
  restoreTlsInspectSummaryLine,
} from './restore-wizard-flow.js';
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
  latestTlsSidecarPath: string | null;
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
  backupStatusText: string;
  tlsSidecarStatusText: string;
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
  restart: () => void;
  refreshLogs: (service?: string) => Promise<void>;
  requestLogsRefresh: (service?: string) => void;
  backupPf: () => void;
  validatePfbackup: () => void;
  exportTlsSidecar: () => void;
  inspectTlsSidecar: () => void;
  applyStorage: () => void;
  recordPfupdateSuccess: (result: Extract<PfupdateApplyResult, { ok: true }>) => void;
  saveRoutingMode: () => void;
  executePinReset: () => void;
  applyRuntimeHealth: (health: HostRuntimeHealth) => void;
  applyConfigSnapshot: (status: HostStatus) => void;
  show: (status: HostStatus) => void;
  hide: () => void;
  clearError: () => void;
};

function createInitialState(): MaintenanceState {
  return {
    status: null,
    compose: null,
    logsService: 'app',
    logsText: '',
    latestBackupPath: null,
    latestTlsSidecarPath: null,
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
    backupStatusText: '',
    tlsSidecarStatusText: '',
    busy: false,
    error: null,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createMaintenanceController(
  deps: MaintenanceControllerDeps,
): MaintenanceController {
  const state = createInitialState();
  const listeners = new Set<() => void>();
  let lifecycleGeneration = 0;

  function notify(): void {
    deps.onStateChange?.();
    for (const listener of listeners) {
      listener();
    }
  }

  function still(generation: number): boolean {
    return generation === lifecycleGeneration;
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

  async function refreshLogs(service?: string, generation = lifecycleGeneration): Promise<void> {
    const logsService = service ?? state.logsService;
    if (!still(generation)) {
      return;
    }
    patch({ logsService });
    const result = await deps.api.getComposeLogs(logsService, 200);
    if (!still(generation)) {
      return;
    }
    patch({ logsText: result.log });
  }

  async function runAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
    const generation = lifecycleGeneration;
    setBusy(true);
    setError(null);
    try {
      const result = await deps.api.runComposeAction(action);
      if (still(generation)) {
        patch({ compose: result.compose });
        if (!result.ok) {
          setError(composeActionErrorMessage(action, result.log));
        }
      }
      deps.onAfterMutation?.();
      if (action !== 'stop') {
        try {
          await refreshLogs(undefined, generation);
        } catch (error) {
          if (still(generation) && result.ok) {
            setError(errorMessage(error, 'Logs konnten nicht geladen werden.'));
          }
        }
      }
    } catch (error) {
      if (still(generation)) {
        setError(errorMessage(error, `Aktion „${action}“ fehlgeschlagen.`));
      }
    } finally {
      if (still(generation)) {
        setBusy(false);
      }
    }
  }

  function saveStorageFolders(restartCompose: boolean): void {
    const importsHostPath = state.importsHostPath.trim();
    const exportsHostPath = state.exportsHostPath.trim();
    if (!importsHostPath || !exportsHostPath) {
      setError(STORAGE_PATHS_VALIDATION_ERROR);
      return;
    }

    const generation = lifecycleGeneration;
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
        if (still(generation)) {
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
        }
        deps.onAfterMutation?.();
      })
      .catch((error) => {
        if (!still(generation)) {
          return;
        }
        patch({ storageStatusText: '' });
        setError(errorMessage(error, 'Speichern der Ordner fehlgeschlagen.'));
      })
      .finally(() => {
        if (still(generation)) {
          setBusy(false);
        }
      });
  }

  function recordPfupdateSuccess(result: Extract<PfupdateApplyResult, { ok: true }>): void {
    const generation = lifecycleGeneration;
    patch({
      compose: result.report.compose ?? state.compose,
      softwareUpdateStatusText: formatPfupdateSuccess(result),
      latestBackupPath: result.report.backupPath,
    });
    void refreshLogs(undefined, generation).catch((error) => {
      if (still(generation)) {
        setError(errorMessage(error, 'Logs konnten nicht geladen werden.'));
      }
    });
  }

  async function browseFolder(
    currentPath: string,
    apply: (path: string) => void,
  ): Promise<string | null> {
    const generation = lifecycleGeneration;
    try {
      const result = await deps.api.selectFolder(currentPath.trim() || undefined);
      if (!still(generation) || result.canceled || !result.path) {
        return null;
      }
      apply(result.path);
      return result.path;
    } catch (error) {
      if (still(generation)) {
        setError(errorMessage(error, 'Ordnerauswahl fehlgeschlagen.'));
      }
      return null;
    }
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
    browseImportsFolder() {
      return browseFolder(state.importsHostPath, (path) => patch({ importsHostPath: path }));
    },
    browseExportsFolder() {
      return browseFolder(state.exportsHostPath, (path) => patch({ exportsHostPath: path }));
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
    restart() {
      deps.requestConfirm(STACK_OFFLINE_CONFIRM_MESSAGE, () => {
        void runAction('restart');
      });
    },
    refreshLogs,
    requestLogsRefresh(service) {
      const generation = lifecycleGeneration;
      setBusy(true);
      setError(null);
      void refreshLogs(service, generation)
        .catch((error) => {
          if (still(generation)) {
            setError(errorMessage(error, 'Logs konnten nicht geladen werden.'));
          }
        })
        .finally(() => {
          if (still(generation)) {
            setBusy(false);
          }
        });
    },
    backupPf() {
      const generation = lifecycleGeneration;
      setBusy(true);
      setError(null);
      patch({ backupStatusText: 'Backup wird erstellt …' });
      void deps.api
        .createPfbackup()
        .then(async (result) => {
          if (still(generation)) {
            patch({
              latestBackupPath: result.backupPath,
              latestTlsSidecarPath: result.tlsSidecarPath ?? null,
            });
          }
          const saveResult = await deps.api.savePfbackup(result.backupPath);
          if (!still(generation)) {
            return;
          }
          if (saveResult.canceled) {
            patch({ backupStatusText: 'Backup lokal gespeichert (Download abgebrochen).' });
            return;
          }
          if (!saveResult.saved) {
            patch({ backupStatusText: '' });
            setError('Download fehlgeschlagen.');
            return;
          }
          patch({ backupStatusText: 'Backup erstellt und exportiert.' });
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ backupStatusText: '' });
          setError(errorMessage(error, 'Backup fehlgeschlagen.'));
        })
        .finally(() => {
          if (still(generation)) {
            setBusy(false);
          }
        });
    },
    validatePfbackup() {
      const generation = lifecycleGeneration;
      setBusy(true);
      setError(null);
      patch({ backupStatusText: 'Backup wird geprüft …' });
      void deps.api
        .readPfbackupForValidate()
        .then(async (picked) => {
          if (!still(generation)) {
            return;
          }
          if (picked.canceled) {
            patch({ backupStatusText: '' });
            return;
          }
          const result = await deps.api.validatePfbackup(picked.content);
          if (!still(generation)) {
            return;
          }
          if (!result.archiveValid) {
            patch({ backupStatusText: '' });
            setError(result.archiveErrors.join(' ') || 'Backup-Datei ungültig.');
            return;
          }
          if (!result.restoreValid) {
            patch({ backupStatusText: pfbackupArchiveOnlyValidText() });
            setError(result.restoreErrors.join(' ') || 'Settings nicht importierbar.');
            return;
          }
          patch({
            backupStatusText: pfbackupValidateSuccessText({
              routingMode: result.summary?.routingMode ?? null,
              releaseVersion: result.summary?.releaseVersion ?? null,
            }),
          });
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ backupStatusText: '' });
          setError(errorMessage(error, 'Backup-Prüfung fehlgeschlagen.'));
        })
        .finally(() => {
          if (still(generation)) {
            setBusy(false);
          }
        });
    },
    exportTlsSidecar() {
      const backupPath = state.latestTlsSidecarPath ?? state.latestBackupPath;
      if (!backupPath) {
        setError('Kein HTTPS-State zum Sichern. Zuerst ein Praxis-Backup erstellen.');
        return;
      }
      const generation = lifecycleGeneration;
      setBusy(true);
      setError(null);
      patch({ tlsSidecarStatusText: 'HTTPS-State wird exportiert …' });
      void deps.api
        .saveTlsSidecar(backupPath)
        .then((saveResult) => {
          if (!still(generation)) {
            return;
          }
          if (saveResult.canceled) {
            patch({ tlsSidecarStatusText: '' });
            return;
          }
          if (!saveResult.saved) {
            patch({ tlsSidecarStatusText: '' });
            setError('HTTPS-State-Export fehlgeschlagen.');
            return;
          }
          patch({ tlsSidecarStatusText: 'HTTPS-State exportiert.' });
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ tlsSidecarStatusText: '' });
          setError(errorMessage(error, 'HTTPS-State-Export fehlgeschlagen.'));
        })
        .finally(() => {
          if (still(generation)) {
            setBusy(false);
          }
        });
    },
    inspectTlsSidecar() {
      if (!state.latestBackupPath) {
        setError('Kein Praxis-Backup zum Prüfen.');
        return;
      }
      const generation = lifecycleGeneration;
      setBusy(true);
      setError(null);
      patch({ tlsSidecarStatusText: 'HTTPS-State wird geprüft …' });
      void deps.api
        .inspectPfbackupFile(state.latestBackupPath)
        .then((inspect) => {
          if (!still(generation)) {
            return;
          }
          const line = restoreTlsInspectSummaryLine(inspect.backup?.tls);
          patch({
            tlsSidecarStatusText:
              line ??
              (inspect.compatibility.restoreSupported
                ? 'HTTPS-State: kein HTTPS in dieser Sicherung.'
                : (restoreInspectBlockedMessage(inspect) ?? 'HTTPS-State-Prüfung fehlgeschlagen.')),
          });
          if (!inspect.compatibility.restoreSupported && inspect.backup?.tls?.inBackup) {
            setError(restoreInspectBlockedMessage(inspect));
          }
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ tlsSidecarStatusText: '' });
          setError(errorMessage(error, 'HTTPS-State-Prüfung fehlgeschlagen.'));
        })
        .finally(() => {
          if (still(generation)) {
            setBusy(false);
          }
        });
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
    recordPfupdateSuccess(result) {
      recordPfupdateSuccess(result);
    },
    saveRoutingMode() {
      if (!state.routingMode) {
        setError('Routing-Modus ist noch nicht geladen.');
        return;
      }
      const routingMode = state.routingMode;
      const generation = lifecycleGeneration;
      setBusy(true);
      setError(null);
      patch({ routingModeStatusText: ROUTING_MODE_SAVE_PROGRESS_TEXT });
      void deps.api
        .setRoutingMode({ routingMode })
        .then((result) => {
          if (still(generation)) {
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
          }
          if (result.ok) {
            deps.onAfterMutation?.();
          }
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ routingModeStatusText: '' });
          setError(errorMessage(error, 'Routing-Modus konnte nicht gespeichert werden.'));
        })
        .finally(() => {
          if (still(generation)) {
            setBusy(false);
          }
        });
    },
    executePinReset() {
      const generation = lifecycleGeneration;
      setBusy(true);
      setError(null);
      patch({ pinResetStatusText: PIN_RESET_PROGRESS_TEXT });
      void deps.api
        .resetStaffPins()
        .then((result) => {
          if (still(generation)) {
            patch({ compose: result.compose });
            if (result.ok) {
              patch({ pinResetStatusText: pinResetSuccessText(result.defaultPin) });
            } else {
              patch({ pinResetStatusText: '' });
              setError(result.log || 'PIN-Reset fehlgeschlagen.');
            }
          }
          if (result.ok) {
            void refreshLogs(undefined, generation).catch((error) => {
              if (still(generation)) {
                setError(errorMessage(error, 'Logs konnten nicht geladen werden.'));
              }
            });
            deps.onAfterMutation?.();
          }
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ pinResetStatusText: '' });
          setError(errorMessage(error, 'PIN-Reset fehlgeschlagen.'));
        })
        .finally(() => {
          if (still(generation)) {
            setBusy(false);
          }
        });
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
      const generation = ++lifecycleGeneration;
      patch({
        status,
        compose: status.compose,
        logsService: 'app',
        logsText: '',
        latestBackupPath: null,
        latestTlsSidecarPath: null,
        importsHostPath: status.folders.imports,
        exportsHostPath: status.folders.exports,
        storageStatusText: '',
        softwareUpdateStatusText: '',
        routingMode: null,
        routingModeSaved: null,
        openVisitCount: 0,
        routingModeStatusText: '',
        pinResetStatusText: '',
        backupStatusText: '',
        tlsSidecarStatusText: '',
        error: null,
      });

      setBusy(true);

      const logsDone = refreshLogs('app', generation).catch((error) => {
        if (still(generation)) {
          setError(errorMessage(error, 'Wartungsdaten konnten nicht geladen werden.'));
        }
      });
      const backupDone = deps.api
        .getPfbackupInfo()
        .then((backupInfoResult) => {
          if (!still(generation)) {
            return;
          }
          patch({
            latestBackupPath: backupInfoResult.latestBackupPath,
            latestTlsSidecarPath: backupInfoResult.latestTlsSidecarPath ?? null,
          });
        })
        .catch((error) => {
          if (still(generation)) {
            setError(errorMessage(error, 'Wartungsdaten konnten nicht geladen werden.'));
          }
        });
      const routingDone = deps.api
        .getRoutingMode()
        .then((routingCapabilities) => {
          if (!still(generation)) {
            return;
          }
          patch({
            routingMode: routingCapabilities.routingMode,
            routingModeSaved: routingCapabilities.routingMode,
            complexRoutingLicensed: routingCapabilities.features.complexRoutingLicensed,
            openVisitCount: Number(routingCapabilities.openVisitCount ?? 0),
          });
        })
        .catch((error) => {
          if (still(generation)) {
            setError(errorMessage(error, 'Wartungsdaten konnten nicht geladen werden.'));
          }
        });

      void Promise.allSettled([logsDone, backupDone, routingDone]).then(() => {
        if (still(generation)) {
          setBusy(false);
        }
      });
    },
    hide() {
      lifecycleGeneration += 1;
    },
    clearError() {
      setError(null);
    },
  };
}
