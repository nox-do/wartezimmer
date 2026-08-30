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
  MAINTENANCE_OTHER_ACTION_RUNNING,
  composeActionErrorMessage,
  emptyMaintenanceErrors,
  pinResetSuccessText,
  routingModeSuccessText,
  pfbackupValidateSuccessText,
  pfbackupArchiveOnlyValidText,
  storagePathsChanged,
  storageSaveErrorText,
  storageSaveStatusText,
  type MaintenanceErrorSurface,
  type MaintenanceErrors,
  type MaintenanceOperation,
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
  activeOperation: MaintenanceOperation | null;
  errors: MaintenanceErrors;
};

export type MaintenanceControllerDeps = MaintenanceCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
  requestConfirm: (
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
  ) => void;
};

export type MaintenanceController = {
  getState: () => Readonly<MaintenanceState>;
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
  beginPinReset: () => boolean;
  cancelPinReset: () => void;
  applyRuntimeHealth: (health: HostRuntimeHealth) => void;
  applyConfigSnapshot: (status: HostStatus) => void;
  show: (status: HostStatus) => void;
  hide: () => void;
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
    activeOperation: null,
    errors: emptyMaintenanceErrors(),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createMaintenanceController(
  deps: MaintenanceControllerDeps,
): MaintenanceController {
  const state = createInitialState();
  let lifecycleGeneration = 0;
  let bootstrapGeneration: number | null = null;
  let inFlightOperation: Exclude<MaintenanceOperation, 'bootstrap'> | null = null;
  let armedOperation: Exclude<MaintenanceOperation, 'bootstrap'> | null = null;

  function notify(): void {
    deps.onStateChange?.();
  }

  function still(generation: number): boolean {
    return generation === lifecycleGeneration;
  }

  function patch(partial: Partial<MaintenanceState>): void {
    Object.assign(state, partial);
    notify();
  }

  function setSurfaceError(surface: MaintenanceErrorSurface, message: string | null): void {
    patch({ errors: { ...state.errors, [surface]: message } });
  }

  function bootstrapIsActive(): boolean {
    return bootstrapGeneration !== null && still(bootstrapGeneration);
  }

  function visibleOperation(): MaintenanceOperation | null {
    return inFlightOperation ?? (bootstrapIsActive() ? 'bootstrap' : null);
  }

  function beginOperation(operation: Exclude<MaintenanceOperation, 'bootstrap'>): boolean {
    if (inFlightOperation || bootstrapIsActive()) {
      return false;
    }
    inFlightOperation = operation;
    patch({
      activeOperation: operation,
      errors: { ...state.errors, [operation]: null },
    });
    return true;
  }

  function cancelArmed(operation: Exclude<MaintenanceOperation, 'bootstrap'>): void {
    if (armedOperation === operation && inFlightOperation === operation) {
      armedOperation = null;
      inFlightOperation = null;
      patch({ activeOperation: visibleOperation() });
    }
  }

  function armOperation(operation: Exclude<MaintenanceOperation, 'bootstrap'>): boolean {
    if (!beginOperation(operation)) {
      setSurfaceError(operation, MAINTENANCE_OTHER_ACTION_RUNNING);
      return false;
    }
    armedOperation = operation;
    return true;
  }

  function startArmedOperation(operation: Exclude<MaintenanceOperation, 'bootstrap'>): boolean {
    if (armedOperation !== operation || inFlightOperation !== operation) {
      return false;
    }
    armedOperation = null;
    return true;
  }

  function startOperation(operation: Exclude<MaintenanceOperation, 'bootstrap'>): boolean {
    if (!beginOperation(operation)) {
      setSurfaceError(operation, MAINTENANCE_OTHER_ACTION_RUNNING);
      return false;
    }
    return true;
  }

  function endOperation(operation: Exclude<MaintenanceOperation, 'bootstrap'>): void {
    if (inFlightOperation !== operation) {
      return;
    }
    inFlightOperation = null;
    if (armedOperation === operation) {
      armedOperation = null;
    }
    patch({ activeOperation: visibleOperation() });
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

  async function runAction(
    action: 'start' | 'stop' | 'restart',
    operationStarted = false,
  ): Promise<void> {
    if (!operationStarted && !startOperation('stack')) {
      return;
    }
    const generation = lifecycleGeneration;
    try {
      const result = await deps.api.runComposeAction(action);
      if (still(generation)) {
        patch({ compose: result.compose });
        if (!result.ok) {
          setSurfaceError('stack', composeActionErrorMessage(action, result.log));
        }
      }
      deps.onAfterMutation?.();
      if (action !== 'stop') {
        try {
          await refreshLogs(undefined, generation);
        } catch (error) {
          if (still(generation) && result.ok) {
            setSurfaceError('stack', errorMessage(error, 'Logs konnten nicht geladen werden.'));
          }
        }
      }
    } catch (error) {
      if (still(generation)) {
        setSurfaceError('stack', errorMessage(error, `Aktion „${action}“ fehlgeschlagen.`));
      }
    } finally {
      endOperation('stack');
    }
  }

  function saveStorageFolders(restartCompose: boolean, operationStarted = false): void {
    const importsHostPath = state.importsHostPath.trim();
    const exportsHostPath = state.exportsHostPath.trim();
    if (!importsHostPath || !exportsHostPath) {
      setSurfaceError('storage', STORAGE_PATHS_VALIDATION_ERROR);
      return;
    }
    if (!operationStarted && !startOperation('storage')) {
      return;
    }

    const generation = lifecycleGeneration;
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
            setSurfaceError('storage', storageError);
          }
        }
        deps.onAfterMutation?.();
      })
      .catch((error) => {
        if (!still(generation)) {
          return;
        }
        patch({ storageStatusText: '' });
        setSurfaceError('storage', errorMessage(error, 'Speichern der Ordner fehlgeschlagen.'));
      })
      .finally(() => {
        endOperation('storage');
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
        setSurfaceError('logs', errorMessage(error, 'Logs konnten nicht geladen werden.'));
      }
    });
  }

  async function browseFolder(
    currentPath: string,
    apply: (path: string) => void,
  ): Promise<string | null> {
    if (state.activeOperation) {
      return null;
    }
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
        setSurfaceError('storage', errorMessage(error, 'Ordnerauswahl fehlgeschlagen.'));
      }
      return null;
    }
  }

  function armStackConfirm(action: 'stop' | 'restart'): void {
    if (inFlightOperation === 'stack') {
      return;
    }
    if (!armOperation('stack')) {
      return;
    }
    deps.requestConfirm(
      STACK_OFFLINE_CONFIRM_MESSAGE,
      () => {
        if (startArmedOperation('stack')) {
          void runAction(action, true);
        }
      },
      () => cancelArmed('stack'),
    );
  }

  return {
    getState: () => state,
    setImportsPath(value) {
      patch({ importsHostPath: value });
    },
    setExportsPath(value) {
      patch({ exportsHostPath: value });
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
      armStackConfirm('stop');
    },
    restart() {
      armStackConfirm('restart');
    },
    refreshLogs,
    requestLogsRefresh(service) {
      if (!beginOperation('logs')) {
        return;
      }
      const generation = lifecycleGeneration;
      void refreshLogs(service, generation)
        .catch((error) => {
          if (still(generation)) {
            setSurfaceError('logs', errorMessage(error, 'Logs konnten nicht geladen werden.'));
          }
        })
        .finally(() => {
          endOperation('logs');
        });
    },
    backupPf() {
      if (!beginOperation('backup')) {
        return;
      }
      const generation = lifecycleGeneration;
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
            setSurfaceError('backup', 'Download fehlgeschlagen.');
            return;
          }
          patch({ backupStatusText: 'Backup erstellt und exportiert.' });
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ backupStatusText: '' });
          setSurfaceError('backup', errorMessage(error, 'Backup fehlgeschlagen.'));
        })
        .finally(() => {
          endOperation('backup');
        });
    },
    validatePfbackup() {
      if (!beginOperation('backup')) {
        return;
      }
      const generation = lifecycleGeneration;
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
            setSurfaceError('backup', result.archiveErrors.join(' ') || 'Backup-Datei ungültig.');
            return;
          }
          if (!result.restoreValid) {
            patch({ backupStatusText: pfbackupArchiveOnlyValidText() });
            setSurfaceError(
              'backup',
              result.restoreErrors.join(' ') || 'Settings nicht importierbar.',
            );
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
          setSurfaceError('backup', errorMessage(error, 'Backup-Prüfung fehlgeschlagen.'));
        })
        .finally(() => {
          endOperation('backup');
        });
    },
    exportTlsSidecar() {
      const backupPath = state.latestTlsSidecarPath ?? state.latestBackupPath;
      if (!backupPath) {
        setSurfaceError(
          'tlsSidecar',
          'Kein HTTPS-State zum Sichern. Zuerst ein Praxis-Backup erstellen.',
        );
        return;
      }
      if (!beginOperation('tlsSidecar')) {
        return;
      }
      const generation = lifecycleGeneration;
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
            setSurfaceError('tlsSidecar', 'HTTPS-State-Export fehlgeschlagen.');
            return;
          }
          patch({ tlsSidecarStatusText: 'HTTPS-State exportiert.' });
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ tlsSidecarStatusText: '' });
          setSurfaceError(
            'tlsSidecar',
            errorMessage(error, 'HTTPS-State-Export fehlgeschlagen.'),
          );
        })
        .finally(() => {
          endOperation('tlsSidecar');
        });
    },
    inspectTlsSidecar() {
      if (!state.latestBackupPath) {
        setSurfaceError('tlsSidecar', 'Kein Praxis-Backup zum Prüfen.');
        return;
      }
      if (!beginOperation('tlsSidecar')) {
        return;
      }
      const generation = lifecycleGeneration;
      patch({ tlsSidecarStatusText: 'HTTPS-State wird geprüft …' });
      void deps.api
        .inspectPfbackupFile(state.latestBackupPath)
        .then((inspect) => {
          if (!still(generation)) {
            return;
          }
          if (!inspect.compatibility.restoreSupported) {
            patch({ tlsSidecarStatusText: '' });
            setSurfaceError(
              'tlsSidecar',
              restoreInspectBlockedMessage(inspect) ?? 'HTTPS-State-Prüfung fehlgeschlagen.',
            );
            return;
          }
          const line = restoreTlsInspectSummaryLine(inspect.backup?.tls);
          patch({
            tlsSidecarStatusText: line ?? 'HTTPS-State: kein HTTPS in dieser Sicherung.',
          });
        })
        .catch((error) => {
          if (!still(generation)) {
            return;
          }
          patch({ tlsSidecarStatusText: '' });
          setSurfaceError(
            'tlsSidecar',
            errorMessage(error, 'HTTPS-State-Prüfung fehlgeschlagen.'),
          );
        })
        .finally(() => {
          endOperation('tlsSidecar');
        });
    },
    applyStorage() {
      if (!state.importsHostPath.trim() || !state.exportsHostPath.trim()) {
        setSurfaceError('storage', STORAGE_PATHS_VALIDATION_ERROR);
        return;
      }

      if ((state.compose?.running ?? false) && pathsChanged()) {
        if (inFlightOperation === 'storage') {
          return;
        }
        if (!armOperation('storage')) {
          return;
        }
        deps.requestConfirm(
          STORAGE_PATHS_RESTART_CONFIRM_MESSAGE,
          () => {
            if (startArmedOperation('storage')) {
              saveStorageFolders(true, true);
            }
          },
          () => cancelArmed('storage'),
        );
        return;
      }

      saveStorageFolders(false);
    },
    recordPfupdateSuccess(result) {
      recordPfupdateSuccess(result);
    },
    saveRoutingMode() {
      if (!state.routingMode) {
        setSurfaceError('routing', 'Routing-Modus ist noch nicht geladen.');
        return;
      }
      if (!beginOperation('routing')) {
        return;
      }
      const routingMode = state.routingMode;
      const generation = lifecycleGeneration;
      patch({ routingModeStatusText: ROUTING_MODE_SAVE_PROGRESS_TEXT });
      void deps.api
        .setRoutingMode({ routingMode })
        .then((result) => {
          if (still(generation)) {
            if (!result.ok) {
              patch({ routingModeStatusText: '' });
              setSurfaceError('routing', formatRoutingModeError(result));
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
          setSurfaceError(
            'routing',
            errorMessage(error, 'Routing-Modus konnte nicht gespeichert werden.'),
          );
        })
        .finally(() => {
          endOperation('routing');
        });
    },
    executePinReset() {
      if (!startArmedOperation('pin')) {
        return;
      }
      const generation = lifecycleGeneration;
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
              setSurfaceError('pin', result.log || 'PIN-Reset fehlgeschlagen.');
            }
          }
          if (result.ok) {
            void refreshLogs(undefined, generation).catch((error) => {
              if (still(generation)) {
                setSurfaceError('pin', errorMessage(error, 'Logs konnten nicht geladen werden.'));
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
          setSurfaceError('pin', errorMessage(error, 'PIN-Reset fehlgeschlagen.'));
        })
        .finally(() => {
          endOperation('pin');
        });
    },
    beginPinReset() {
      return armOperation('pin');
    },
    cancelPinReset() {
      cancelArmed('pin');
    },
    applyRuntimeHealth(health) {
      patch({ compose: health.compose });
    },
    applyConfigSnapshot(status) {
      const next: Partial<MaintenanceState> = { status };
      if (!state.activeOperation) {
        next.importsHostPath = status.folders.imports;
        next.exportsHostPath = status.folders.exports;
      }
      patch(next);
    },
    show(status) {
      const generation = ++lifecycleGeneration;
      bootstrapGeneration = generation;
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
        activeOperation: visibleOperation(),
        errors: emptyMaintenanceErrors(),
      });

      const logsDone = refreshLogs('app', generation).catch((error) => {
        if (still(generation)) {
          setSurfaceError('logs', errorMessage(error, 'Wartungsdaten konnten nicht geladen werden.'));
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
            setSurfaceError(
              'backup',
              errorMessage(error, 'Wartungsdaten konnten nicht geladen werden.'),
            );
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
            setSurfaceError(
              'routing',
              errorMessage(error, 'Wartungsdaten konnten nicht geladen werden.'),
            );
          }
        });

      void Promise.allSettled([logsDone, backupDone, routingDone]).then(() => {
        if (!still(generation)) {
          return;
        }
        bootstrapGeneration = null;
        patch({ activeOperation: visibleOperation() });
      });
    },
    hide() {
      lifecycleGeneration += 1;
      bootstrapGeneration = null;
      if (armedOperation) {
        inFlightOperation = null;
        armedOperation = null;
      }
      patch({ activeOperation: visibleOperation() });
    },
  };
}
