import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { ComposeStatus, HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import {
  DOCKER_FILE_SHARING_HINT,
  needsDockerFileSharingHint,
} from '../shared/docker-file-sharing-hint.js';
import { formatEnvBackupLabel } from '@praxis-flow/server-shared';
import { createFolderPathField } from './folder-path-field.js';
import {
  deliveryImagesSummary,
  pickAndLoadReleaseArchive,
} from './delivery-images-flow.js';
import { queryRequired } from './dom.js';
import { createViewLoadingOverlay } from './view-loading.js';

export type MaintenanceCallbacks = {
  onBack: () => void;
  onAfterMutation?: () => void;
};

type MaintenanceState = {
  status: HostStatus | null;
  compose: ComposeStatus | null;
  logsService: string;
  logsText: string;
  latestBackupPath: string | null;
  importsHostPath: string;
  exportsHostPath: string;
  storageStatusText: string;
  softwareUpdateStatusText: string;
  busy: boolean;
  error: string | null;
};

const LOG_SERVICES = [
  { value: 'app', label: 'app' },
  { value: 'sandbox', label: 'sandbox' },
  { value: 'gateway', label: 'gateway' },
] as const;

export function createMaintenanceView(
  root: HTMLElement,
  api: PraxisManagerApi,
  callbacks: MaintenanceCallbacks,
) {
  const logsSelect = queryRequired<HTMLSelectElement>(
    root,
    '#maintenance-logs-service',
    'Maintenance-UI',
  );
  const logsPre = queryRequired<HTMLPreElement>(root, '#maintenance-logs', 'Maintenance-UI');
  const backupInfo = queryRequired<HTMLElement>(root, '#maintenance-backup-info', 'Maintenance-UI');
  const errorEl = queryRequired<HTMLElement>(root, '#maintenance-error', 'Maintenance-UI');
  const backBtn = queryRequired<HTMLButtonElement>(root, '#maintenance-back', 'Maintenance-UI');
  const stackToggle = queryRequired<HTMLInputElement>(
    root,
    '#maintenance-stack-toggle',
    'Maintenance-UI',
  );
  const stackStatus = queryRequired<HTMLElement>(
    root,
    '#maintenance-stack-status',
    'Maintenance-UI',
  );
  const restartBuildBtn = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-restart-build',
    'Maintenance-UI',
  );
  const restartBtn = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-restart',
    'Maintenance-UI',
  );
  const refreshLogsBtn = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-refresh-logs',
    'Maintenance-UI',
  );
  const backupBtn = queryRequired<HTMLButtonElement>(root, '#maintenance-backup', 'Maintenance-UI');
  const pinResetBtn = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-reset-staff-pins',
    'Maintenance-UI',
  );
  const pinResetStatus = queryRequired<HTMLElement>(
    root,
    '#maintenance-pin-reset-status',
    'Maintenance-UI',
  );
  const confirmDialog = queryRequired<HTMLDialogElement>(
    root,
    '#maintenance-confirm',
    'Maintenance-UI',
  );
  const confirmMessage = queryRequired<HTMLElement>(
    root,
    '#maintenance-confirm-message',
    'Maintenance-UI',
  );
  const confirmOk = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-confirm-ok',
    'Maintenance-UI',
  );
  const confirmCancel = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-confirm-cancel',
    'Maintenance-UI',
  );
  const pinResetDialog = queryRequired<HTMLDialogElement>(
    root,
    '#maintenance-pin-reset-confirm',
    'Maintenance-UI',
  );
  const pinResetOk = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-pin-reset-ok',
    'Maintenance-UI',
  );
  const pinResetCancel = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-pin-reset-cancel',
    'Maintenance-UI',
  );
  const importsFieldHost = queryRequired<HTMLElement>(
    root,
    '#maintenance-imports-field',
    'Maintenance-UI',
  );
  const exportsFieldHost = queryRequired<HTMLElement>(
    root,
    '#maintenance-exports-field',
    'Maintenance-UI',
  );
  const storageWarning = queryRequired<HTMLElement>(
    root,
    '#maintenance-storage-warning',
    'Maintenance-UI',
  );
  const storageApplyBtn = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-storage-apply',
    'Maintenance-UI',
  );
  const storageStatus = queryRequired<HTMLElement>(
    root,
    '#maintenance-storage-status',
    'Maintenance-UI',
  );
  const fileSharingHint = queryRequired<HTMLElement>(
    root,
    '#maintenance-storage-file-sharing',
    'Maintenance-UI',
  );
  const softwareUpdateSection = queryRequired<HTMLElement>(
    root,
    '#maintenance-software-update-section',
    'Maintenance-UI',
  );
  const softwareInfo = queryRequired<HTMLElement>(
    root,
    '#maintenance-software-info',
    'Maintenance-UI',
  );
  const softwareImportBtn = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-software-import',
    'Maintenance-UI',
  );
  const softwareStatus = queryRequired<HTMLElement>(
    root,
    '#maintenance-software-status',
    'Maintenance-UI',
  );

  const viewLoading = createViewLoadingOverlay(root);

  const state: MaintenanceState = {
    status: null,
    compose: null,
    logsService: 'app',
    logsText: '',
    latestBackupPath: null,
    importsHostPath: '',
    exportsHostPath: '',
    storageStatusText: '',
    softwareUpdateStatusText: '',
    busy: false,
    error: null,
  };

  let pendingConfirmAction: (() => void) | null = null;

  function setBusy(busy: boolean): void {
    state.busy = busy;
    for (const button of [
      backBtn,
      restartBuildBtn,
      restartBtn,
      refreshLogsBtn,
      backupBtn,
      pinResetBtn,
      storageApplyBtn,
      softwareImportBtn,
      confirmOk,
      confirmCancel,
      pinResetOk,
      pinResetCancel,
    ]) {
      button.disabled = busy;
    }
    stackToggle.disabled = busy;
    logsSelect.disabled = busy;
    renderStorageFields();
  }

  function setError(message: string | null): void {
    state.error = message;
    if (message) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  function renderLogs(): void {
    logsPre.textContent = state.logsText || '(keine Logs)';
  }

  function renderBackupInfo(): void {
    if (state.latestBackupPath) {
      backupInfo.textContent = `Letztes Backup: ${formatEnvBackupLabel(state.latestBackupPath)}`;
    } else if (state.status?.envExists) {
      backupInfo.textContent = 'Noch kein Backup vorhanden.';
    } else {
      backupInfo.textContent = 'Keine .env vorhanden.';
    }
  }

  function renderStackToggle(): void {
    const running = state.compose?.running ?? false;
    stackToggle.checked = running;
    stackStatus.textContent = running ? 'Läuft' : 'Gestoppt';
    restartBuildBtn.hidden = state.status?.mode !== 'repo';
  }

  function storagePathsChanged(): boolean {
    const current = state.status?.folders;
    if (!current) {
      return false;
    }
    return (
      state.importsHostPath.trim() !== current.imports ||
      state.exportsHostPath.trim() !== current.exports
    );
  }

  function renderSoftwareUpdateSection(): void {
    const status = state.status;
    const required = status?.deliveryImages.required ?? false;
    softwareUpdateSection.hidden = !required;
    if (!required || !status) {
      softwareInfo.replaceChildren();
      softwareStatus.textContent = '';
      return;
    }

    const rows: Array<[string, string]> = [
      ['Aktuell', deliveryImagesSummary(status)],
    ];
    if (status.deliveryImages.appImage) {
      rows.push(['app', status.deliveryImages.appImage]);
    }
    if (status.deliveryImages.sandboxImage) {
      rows.push(['sandbox', status.deliveryImages.sandboxImage]);
    }

    softwareInfo.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
    softwareStatus.textContent = state.softwareUpdateStatusText;
  }

  function renderAll(): void {
    renderFileSharingHint();
    renderStackToggle();
    renderSoftwareUpdateSection();
    renderStorageFields();
    renderLogs();
    renderBackupInfo();
  }

  function renderStorageFields(): void {
    importsFieldHost.replaceChildren(
      createFolderPathField({
        label: 'Importordner',
        value: state.importsHostPath,
        disabled: state.busy,
        onChange: (value) => {
          state.importsHostPath = value;
          renderStorageWarning();
        },
        onBrowse: async () => {
          const result = await api.selectFolder(state.importsHostPath.trim() || undefined);
          if (!result.canceled && result.path) {
            state.importsHostPath = result.path;
            renderStorageFields();
            renderStorageWarning();
            return result.path;
          }
          return null;
        },
      }),
    );

    exportsFieldHost.replaceChildren(
      createFolderPathField({
        label: 'Exportordner',
        value: state.exportsHostPath,
        disabled: state.busy,
        onChange: (value) => {
          state.exportsHostPath = value;
          renderStorageWarning();
        },
        onBrowse: async () => {
          const result = await api.selectFolder(state.exportsHostPath.trim() || undefined);
          if (!result.canceled && result.path) {
            state.exportsHostPath = result.path;
            renderStorageFields();
            renderStorageWarning();
            return result.path;
          }
          return null;
        },
      }),
    );

    storageStatus.textContent = state.storageStatusText;
    renderStorageWarning();
  }

  function renderStorageWarning(): void {
    const running = state.compose?.running ?? false;
    const changed = storagePathsChanged();
    if (running && changed) {
      storageWarning.hidden = false;
      storageWarning.textContent =
        'Neue Mounts werden erst nach einem Stack-Neustart aktiv. Beim Übernehmen wird danach gefragt.';
      return;
    }
    storageWarning.hidden = true;
    storageWarning.textContent = '';
  }

  function renderFileSharingHint(): void {
    if (needsDockerFileSharingHint(api.hostPlatform)) {
      fileSharingHint.hidden = false;
      fileSharingHint.textContent = DOCKER_FILE_SHARING_HINT;
    } else {
      fileSharingHint.hidden = true;
      fileSharingHint.textContent = '';
    }
  }

  async function refreshLogs(): Promise<void> {
    const service = logsSelect.value || state.logsService;
    state.logsService = service;
    const result = await api.getComposeLogs(service, 200);
    state.logsText = result.log;
    renderLogs();
  }

  async function runAction(action: 'start' | 'stop' | 'restart', build = false): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api.runComposeAction(action, build);
      state.compose = result.compose;
      renderStackToggle();
      if (!result.ok) {
        setError(result.log || `Aktion „${action}“ fehlgeschlagen.`);
      }
      if (action !== 'stop') {
        await refreshLogs();
      }
      callbacks.onAfterMutation?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : `Aktion „${action}“ fehlgeschlagen.`);
    } finally {
      setBusy(false);
    }
  }

  function openConfirm(message: string, onConfirm: () => void): void {
    pendingConfirmAction = onConfirm;
    confirmMessage.textContent = message;
    confirmDialog.showModal();
  }

  confirmCancel.addEventListener('click', () => {
    pendingConfirmAction = null;
    confirmDialog.close();
  });

  confirmOk.addEventListener('click', () => {
    const action = pendingConfirmAction;
    pendingConfirmAction = null;
    confirmDialog.close();
    if (action) {
      action();
    }
  });

  stackToggle.addEventListener('change', () => {
    if (stackToggle.checked) {
      void runAction('start').then(() => {
        if (!state.compose?.running) {
          renderStackToggle();
        }
      });
      return;
    }

    stackToggle.checked = true;
    openConfirm(
      'Praxis offline — Terminal und MFA sind während Stop/Neustart nicht erreichbar. Fortfahren?',
      () => {
        void runAction('stop');
      },
    );
  });

  restartBuildBtn.addEventListener('click', () => {
    void runAction('restart', true);
  });

  restartBtn.addEventListener('click', () => {
    openConfirm(
      'Praxis offline — Terminal und MFA sind während Stop/Neustart nicht erreichbar. Fortfahren?',
      () => {
        void runAction('restart');
      },
    );
  });

  logsSelect.addEventListener('change', () => {
    setBusy(true);
    void refreshLogs()
      .catch((error) => {
        setError(error instanceof Error ? error.message : 'Logs konnten nicht geladen werden.');
      })
      .finally(() => setBusy(false));
  });

  refreshLogsBtn.addEventListener('click', () => {
    setBusy(true);
    void refreshLogs()
      .catch((error) => {
        setError(error instanceof Error ? error.message : 'Logs konnten nicht geladen werden.');
      })
      .finally(() => setBusy(false));
  });

  backupBtn.addEventListener('click', () => {
    setBusy(true);
    setError(null);
    void api
      .backupEnv()
      .then(async (result) => {
        state.latestBackupPath = result.backupPath;
        renderBackupInfo();
        const saveResult = await api.saveEnvBackup(result.backupPath);
        if (!saveResult.canceled && !saveResult.saved) {
          setError('Download fehlgeschlagen.');
        }
      })
      .catch((error) => {
        setError(error instanceof Error ? error.message : '.env-Backup fehlgeschlagen.');
      })
      .finally(() => setBusy(false));
  });

  function saveStorageFolders(restartCompose: boolean): void {
    const importsHostPath = state.importsHostPath.trim();
    const exportsHostPath = state.exportsHostPath.trim();
    if (!importsHostPath || !exportsHostPath) {
      setError('Bitte Import- und Exportordner angeben.');
      return;
    }

    setBusy(true);
    setError(null);
    state.storageStatusText = 'Speichern …';
    renderStorageFields();

    void api
      .saveStorageFolders({
        importsHostPath,
        exportsHostPath,
        restartCompose,
      })
      .then((result) => {
        state.importsHostPath = result.folders.imports;
        state.exportsHostPath = result.folders.exports;
        if (state.status) {
          state.status = {
            ...state.status,
            folders: result.folders,
          };
        }
        state.latestBackupPath = result.backupPath;
        const parts = ['Pfade gespeichert.'];
        if (result.created.length > 0) {
          parts.push(`Ordner angelegt: ${result.created.join(', ')}`);
        }
        if (result.backupPath) {
          parts.push(`Backup: ${formatEnvBackupLabel(result.backupPath)}`);
        }
        if (result.compose) {
          state.compose = result.compose;
          renderStackToggle();
        }
        if (result.composeRestarted) {
          parts.push('Stack neu gestartet.');
        } else if (result.stackWasRunning && restartCompose) {
          parts.push('Stack-Neustart fehlgeschlagen — bitte manuell neu starten.');
          setError(result.restartLog || 'Stack-Neustart fehlgeschlagen.');
        } else if (result.stackWasRunning) {
          parts.push('Stack läuft noch mit alten Mounts — Neustart empfohlen.');
        }
        state.storageStatusText = parts.join(' ');
        renderBackupInfo();
        renderStorageFields();
        callbacks.onAfterMutation?.();
      })
      .catch((error) => {
        state.storageStatusText = '';
        renderStorageFields();
        setError(error instanceof Error ? error.message : 'Speichern der Ordner fehlgeschlagen.');
      })
      .finally(() => {
        setBusy(false);
        renderStorageFields();
      });
  }

  function runSoftwareUpdate(restartCompose: boolean): void {
    setBusy(true);
    setError(null);
    state.softwareUpdateStatusText = 'Prüfsumme und Import …';
    renderSoftwareUpdateSection();

    void pickAndLoadReleaseArchive(api, {
      restartCompose,
      loadingMessage: 'Prüfsumme und Import …',
      onProgress: (progress) => {
        if (progress.phase === 'loading') {
          state.softwareUpdateStatusText = progress.statusText;
          renderSoftwareUpdateSection();
        }
      },
    })
      .then(async (pickResult) => {
        if (pickResult.canceled) {
          state.softwareUpdateStatusText = '';
          renderSoftwareUpdateSection();
          return;
        }
        if (!pickResult.ok || !pickResult.result) {
          state.softwareUpdateStatusText = '';
          renderSoftwareUpdateSection();
          if (pickResult.error) {
            setError(pickResult.error);
          }
          return;
        }

        const result = pickResult.result;
        if (state.status) {
          state.status = {
            ...state.status,
            envExists: true,
            deliveryImages: result.deliveryImages,
            compose: result.compose ?? state.status.compose,
          };
        }
        if (result.compose) {
          state.compose = result.compose;
          renderStackToggle();
        }

        const parts = [
          `Import OK — SHA256 (${result.sha256Source}) verifiziert.`,
          `app: ${result.appImage}`,
          `sandbox: ${result.sandboxImage}`,
        ];
        if (result.releaseVersion) {
          parts.push(`Version: ${result.releaseVersion}`);
        }
        if (result.backupPath) {
          parts.push(`Backup: ${formatEnvBackupLabel(result.backupPath)}`);
        }
        if (restartCompose) {
          parts.push(
            result.composeRestarted
              ? 'Stack mit neuen Images neu gestartet.'
              : 'Stack-Neustart fehlgeschlagen — bitte manuell neu starten.',
          );
          if (!result.composeRestarted && result.restartLog) {
            setError(result.restartLog);
          }
        } else {
          parts.push('Stack unverändert — bei laufendem Betrieb Neustart ausführen.');
        }
        state.softwareUpdateStatusText = parts.join(' ');
        renderSoftwareUpdateSection();
        callbacks.onAfterMutation?.();
        if (restartCompose && result.composeRestarted) {
          await refreshLogs();
        }
      })
      .catch((error) => {
        state.softwareUpdateStatusText = '';
        renderSoftwareUpdateSection();
        setError(
          error instanceof Error ? error.message : 'Software-Update konnte nicht importiert werden.',
        );
      })
      .finally(() => setBusy(false));
  }

  softwareImportBtn.addEventListener('click', () => {
    const stackRunning = state.compose?.running ?? false;
    const proceed = () => runSoftwareUpdate(stackRunning);

    if (stackRunning) {
      openConfirm(
        'Praxis offline — während des Updates sind Terminal und MFA kurz nicht erreichbar. Fortfahren?',
        proceed,
      );
      return;
    }

    proceed();
  });

  storageApplyBtn.addEventListener('click', () => {
    if (!state.importsHostPath.trim() || !state.exportsHostPath.trim()) {
      setError('Bitte Import- und Exportordner angeben.');
      return;
    }

    if ((state.compose?.running ?? false) && storagePathsChanged()) {
      openConfirm(
        'Die neuen Import-/Export-Ordner werden erst nach einem Stack-Neustart aktiv. Pfade speichern und Stack jetzt neu starten?',
        () => saveStorageFolders(true),
      );
      return;
    }

    saveStorageFolders(false);
  });

  pinResetBtn.addEventListener('click', () => {
    pinResetDialog.showModal();
  });

  pinResetCancel.addEventListener('click', () => {
    pinResetDialog.close();
  });

  pinResetOk.addEventListener('click', () => {
    pinResetDialog.close();
    setBusy(true);
    setError(null);
    pinResetStatus.textContent = 'PIN-Reset läuft …';
    void api
      .resetStaffPins()
      .then((result) => {
        state.compose = result.compose;
        renderStackToggle();
        renderStorageWarning();
        if (result.ok) {
          pinResetStatus.textContent = `Erfolgreich — MFA- und Ops-PIN ist jetzt ${result.defaultPin}. MFA-PIN in MFA → Betrieb, Ops-PIN in System → PIN & Sicherheit ändern.`;
          void refreshLogs();
          callbacks.onAfterMutation?.();
        } else {
          pinResetStatus.textContent = '';
          setError(result.log || 'PIN-Reset fehlgeschlagen.');
        }
      })
      .catch((error) => {
        pinResetStatus.textContent = '';
        setError(error instanceof Error ? error.message : 'PIN-Reset fehlgeschlagen.');
      })
      .finally(() => setBusy(false));
  });

  backBtn.addEventListener('click', () => {
    callbacks.onBack();
  });

  return {
    applyRuntimeHealth(health: HostRuntimeHealth): void {
      state.compose = health.compose;
      renderStackToggle();
      renderStorageWarning();
    },
    applyConfigSnapshot(status: HostStatus): void {
      state.status = status;
      if (!state.busy) {
        state.importsHostPath = status.folders.imports;
        state.exportsHostPath = status.folders.exports;
      }
      renderSoftwareUpdateSection();
      renderStorageFields();
      renderStorageWarning();
      renderBackupInfo();
    },
    show(status: HostStatus): void {
      root.hidden = false;
      state.status = status;
      state.compose = status.compose;
      state.logsService = 'app';
      state.logsText = '';
      state.latestBackupPath = null;
      state.importsHostPath = status.folders.imports;
      state.exportsHostPath = status.folders.exports;
      state.storageStatusText = '';
      state.softwareUpdateStatusText = '';
      state.error = null;
      pinResetStatus.textContent = '';

      logsSelect.replaceChildren(
        ...LOG_SERVICES.map((service) => {
          const option = document.createElement('option');
          option.value = service.value;
          option.textContent = service.label;
          return option;
        }),
      );
      logsSelect.value = 'app';

      renderAll();
      setBusy(true);
      void Promise.all([refreshLogs(), api.getEnvBackupInfo()])
        .then(([, backupInfoResult]) => {
          state.latestBackupPath = backupInfoResult.latestBackupPath;
          renderBackupInfo();
        })
        .catch((error) => {
          setError(
            error instanceof Error ? error.message : 'Wartungsdaten konnten nicht geladen werden.',
          );
        })
        .finally(() => setBusy(false));
    },
    hide(): void {
      root.hidden = true;
      viewLoading.setLoading(false);
      setError(null);
    },
    setLoading: viewLoading.setLoading,
  };
}
