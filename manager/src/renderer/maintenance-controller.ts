import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { evaluateHostLifecycleAction } from '@praxis-flow/server-shared/host-lifecycle-policy';
import type { ComposeStatus, HostStatus } from '../shared/host-status.js';
import type { PfupdateApplyResult } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { formatPfupdateSuccess } from './pfupdate-flow.js';
import {
  PIN_RESET_PROGRESS_TEXT,
  STACK_OFFLINE_CONFIRM_MESSAGE,
  STORAGE_PATHS_RESTART_CONFIRM_MESSAGE,
  STORAGE_PATHS_VALIDATION_ERROR,
  STORAGE_SAVE_PROGRESS_TEXT,
  MAINTENANCE_OTHER_ACTION_RUNNING,
  composeActionErrorMessage,
  emptyMaintenanceErrors,
  pinResetSuccessText,
  storagePathsChanged,
  storageSaveErrorText,
  storageSaveStatusText,
  type MaintenanceErrorSurface,
  type MaintenanceErrors,
  type MaintenanceOperation,
} from './maintenance-view-model.js';

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
  rebuildStatusText: string;
  pinResetStatusText: string;
  backupStatusText: string;
  activeOperation: MaintenanceOperation | null;
  errors: MaintenanceErrors;
};

export type MaintenanceControllerDeps = MaintenanceCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
  requestConfirm: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
};

export type MaintenanceController = {
  getState: () => Readonly<MaintenanceState>;
  setImportsPath: (value: string) => void;
  setExportsPath: (value: string) => void;
  browseImportsFolder: () => Promise<string | null>;
  browseExportsFolder: () => Promise<string | null>;
  handleStackToggle: (wantRunning: boolean) => void;
  restart: () => void;
  rebuild: () => void;
  refreshLogs: (service?: string) => Promise<void>;
  requestLogsRefresh: (service?: string) => void;
  backupPf: () => void;
  applyStorage: () => void;
  recordPfupdateSuccess: (result: Extract<PfupdateApplyResult, { ok: true }>) => void;
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
    importsHostPath: '',
    exportsHostPath: '',
    storageStatusText: '',
    softwareUpdateStatusText: '',
    rebuildStatusText: '',
    pinResetStatusText: '',
    backupStatusText: '',
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
      const lifecycle = state.status?.lifecycle;
      if (lifecycle) {
        const decision = evaluateHostLifecycleAction(lifecycle, `stack-${action}`);
        if (!decision.allowed) {
          setSurfaceError('stack', decision.reason ?? 'Host-Aktion derzeit nicht erlaubt.');
          return;
        }
      }
      patch({ rebuildStatusText: '' });
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
    rebuild() {
      const lifecycle = state.status?.lifecycle;
      if (lifecycle) {
        const decision = evaluateHostLifecycleAction(lifecycle, 'rebuild');
        if (!decision.allowed) {
          setSurfaceError('stack', decision.reason ?? 'Host-Aktion derzeit nicht erlaubt.');
          return;
        }
      }
      if (!armOperation('stack')) return;
      deps.requestConfirm(
        'Betrieb mit den gespeicherten Einstellungen wiederherstellen? Laufende Dienste werden neu aufgebaut. Gestoppte Dienste bleiben gestoppt. Alle benötigten Images müssen lokal vorhanden sein. Praxisdaten und TLS-Identität bleiben erhalten.',
        () => {
          if (!startArmedOperation('stack')) return;
          const generation = lifecycleGeneration;
          patch({ rebuildStatusText: '' });
          void (async () => {
            try {
              const result = await deps.api.rebuildHost();
              if (still(generation)) {
                patch({ compose: result.compose, rebuildStatusText: result.ok ? result.log : '' });
                if (!result.ok) setSurfaceError('stack', result.log);
              }
            } catch (error) {
              if (still(generation))
                setSurfaceError('stack', errorMessage(error, 'Wiederherstellung fehlgeschlagen.'));
            } finally {
              deps.onAfterMutation?.();
              endOperation('stack');
            }
          })();
        },
        () => cancelArmed('stack'),
      );
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
              setSurfaceError(
                'pin',
                'PIN-Reset fehlgeschlagen. Technische Details finden Sie im Bereich „Logs“.',
              );
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
      const draftWasDirty = storagePathsChanged(
        state.importsHostPath,
        state.exportsHostPath,
        state.status?.folders,
      );
      const next: Partial<MaintenanceState> = { status };
      if (!state.activeOperation && !draftWasDirty) {
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
        importsHostPath: status.folders.imports,
        exportsHostPath: status.folders.exports,
        storageStatusText: '',
        softwareUpdateStatusText: '',
        pinResetStatusText: '',
        backupStatusText: '',
        activeOperation: visibleOperation(),
        errors: emptyMaintenanceErrors(),
      });

      const logsDone = refreshLogs('app', generation).catch((error) => {
        if (still(generation)) {
          setSurfaceError(
            'logs',
            errorMessage(error, 'Wartungsdaten konnten nicht geladen werden.'),
          );
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
      void Promise.allSettled([logsDone, backupDone]).then(() => {
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
