import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { createFolderPathField } from './folder-path-field.js';
import {
  MAINTENANCE_LOG_SERVICES,
  backupInfoText,
  fileSharingHintText,
  logsDisplayText,
  routingModeSaveDisabled,
  showRestartBuildButton,
  softwareUpdateInfoRows,
  softwareUpdateSectionVisible,
  stackStatusLabel,
  storagePathsChanged,
  storageWarningText,
} from './maintenance-view-model.js';
import {
  createMaintenanceController,
  type MaintenanceCallbacks,
} from './maintenance-controller.js';
import { queryRequired } from './dom.js';
import { setButtonIcon } from './lucide-icons.js';
import { createViewLoadingOverlay } from './view-loading.js';
import { createMaintenanceAccordion } from './maintenance-accordion.js';
import { renderRoutingModePanel } from './routing-mode-ui.js';

export type { MaintenanceCallbacks };

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
  const backupTipBtn = queryRequired<HTMLButtonElement>(
    root,
    '[aria-describedby="maintenance-backup-tip"]',
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
  const routingModePanel = queryRequired<HTMLElement>(
    root,
    '#maintenance-routing-mode-panel',
    'Maintenance-UI',
  );
  const routingModeSaveBtn = queryRequired<HTMLButtonElement>(
    root,
    '#maintenance-routing-mode-save',
    'Maintenance-UI',
  );
  const routingModeStatus = queryRequired<HTMLElement>(
    root,
    '#maintenance-routing-mode-status',
    'Maintenance-UI',
  );

  const viewLoading = createViewLoadingOverlay(root);
  createMaintenanceAccordion(
    queryRequired<HTMLElement>(root, '#maintenance-accordion', 'Maintenance-UI'),
    'practice',
  );
  setButtonIcon(refreshLogsBtn, 'rotate-cw');
  setButtonIcon(backupTipBtn, 'info');

  let pendingConfirmAction: (() => void) | null = null;

  function openConfirm(message: string, onConfirm: () => void): void {
    pendingConfirmAction = onConfirm;
    confirmMessage.textContent = message;
    confirmDialog.showModal();
  }

  function setControlsDisabled(busy: boolean): void {
    for (const button of [
      restartBuildBtn,
      restartBtn,
      refreshLogsBtn,
      backupBtn,
      pinResetBtn,
      storageApplyBtn,
      softwareImportBtn,
      routingModeSaveBtn,
      confirmOk,
      confirmCancel,
      pinResetOk,
      pinResetCancel,
    ]) {
      button.disabled = busy;
    }
    stackToggle.disabled = busy;
    logsSelect.disabled = busy;
  }

  function renderError(): void {
    const message = controller.getState().error;
    if (message) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  function renderLogs(): void {
    logsPre.textContent = logsDisplayText(controller.getState().logsText);
  }

  function renderBackupInfo(): void {
    const state = controller.getState();
    backupInfo.textContent = backupInfoText(state.latestBackupPath, state.status?.envExists);
  }

  function renderStackToggle(): void {
    const state = controller.getState();
    const running = state.compose?.running ?? false;
    stackToggle.checked = running;
    stackStatus.textContent = stackStatusLabel(running);
    restartBuildBtn.hidden = !showRestartBuildButton(state.status?.mode);
  }

  function renderSoftwareUpdateSection(): void {
    const state = controller.getState();
    const status = state.status;
    const required = softwareUpdateSectionVisible(status);
    softwareUpdateSection.hidden = !required;
    if (!required || !status) {
      softwareInfo.replaceChildren();
      softwareStatus.textContent = '';
      return;
    }

    softwareInfo.replaceChildren(
      ...softwareUpdateInfoRows(status).flatMap(({ label, value }) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
    softwareStatus.textContent = state.softwareUpdateStatusText;
  }

  function renderRoutingMode(): void {
    const state = controller.getState();
    routingModeStatus.textContent = state.routingModeStatusText;
    routingModeSaveBtn.disabled = routingModeSaveDisabled(
      state.busy,
      state.routingMode,
      state.routingModeSaved,
    );
    renderRoutingModePanel(
      routingModePanel,
      {
        routingMode: state.routingMode,
        complexRoutingLicensed: state.complexRoutingLicensed,
        busy: state.busy,
      },
      {
        disabled: state.busy,
        context: 'maintenance',
        onChange: (routingMode) => {
          controller.setRoutingMode(routingMode);
        },
      },
    );
  }

  function renderStorageFields(): void {
    const state = controller.getState();
    importsFieldHost.replaceChildren(
      createFolderPathField({
        label: 'Importordner',
        value: state.importsHostPath,
        disabled: state.busy,
        onChange: (value) => {
          controller.setImportsPath(value);
          renderStorageWarning();
        },
        onBrowse: () => controller.browseImportsFolder(),
      }),
    );

    exportsFieldHost.replaceChildren(
      createFolderPathField({
        label: 'Exportordner',
        value: state.exportsHostPath,
        disabled: state.busy,
        onChange: (value) => {
          controller.setExportsPath(value);
          renderStorageWarning();
        },
        onBrowse: () => controller.browseExportsFolder(),
      }),
    );

    storageStatus.textContent = state.storageStatusText;
    renderStorageWarning();
  }

  function renderStorageWarning(): void {
    const state = controller.getState();
    const warning = storageWarningText(
      state.compose?.running ?? false,
      storagePathsChanged(state.importsHostPath, state.exportsHostPath, state.status?.folders),
    );
    storageWarning.hidden = warning === null;
    storageWarning.textContent = warning ?? '';
  }

  function renderFileSharingHint(): void {
    const hint = fileSharingHintText(api.hostPlatform);
    fileSharingHint.hidden = hint === null;
    fileSharingHint.textContent = hint ?? '';
  }

  function renderPinResetStatus(): void {
    pinResetStatus.textContent = controller.getState().pinResetStatusText;
  }

  function renderAll(): void {
    const { busy } = controller.getState();
    setControlsDisabled(busy);
    renderError();
    renderFileSharingHint();
    renderStackToggle();
    renderSoftwareUpdateSection();
    renderStorageFields();
    renderRoutingMode();
    renderLogs();
    renderBackupInfo();
    renderPinResetStatus();
  }

  function setupLogsSelect(): void {
    logsSelect.replaceChildren(
      ...MAINTENANCE_LOG_SERVICES.map((service) => {
        const option = document.createElement('option');
        option.value = service.value;
        option.textContent = service.label;
        return option;
      }),
    );
    logsSelect.value = 'app';
  }

  const controller = createMaintenanceController({
    api,
    onAfterMutation: callbacks.onAfterMutation,
    requestConfirm: openConfirm,
    onStateChange: renderAll,
  });

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
    const wantRunning = stackToggle.checked;
    if (!wantRunning) {
      stackToggle.checked = true;
    }
    controller.handleStackToggle(wantRunning);
  });

  restartBuildBtn.addEventListener('click', () => {
    controller.restartBuild();
  });

  restartBtn.addEventListener('click', () => {
    controller.restart();
  });

  logsSelect.addEventListener('change', () => {
    controller.requestLogsRefresh(logsSelect.value);
  });

  refreshLogsBtn.addEventListener('click', () => {
    controller.requestLogsRefresh(logsSelect.value);
  });

  backupBtn.addEventListener('click', () => {
    controller.backupEnv();
  });

  softwareImportBtn.addEventListener('click', () => {
    controller.importSoftware();
  });

  storageApplyBtn.addEventListener('click', () => {
    controller.applyStorage();
  });

  pinResetBtn.addEventListener('click', () => {
    pinResetDialog.showModal();
  });

  routingModeSaveBtn.addEventListener('click', () => {
    controller.saveRoutingMode();
  });

  pinResetCancel.addEventListener('click', () => {
    pinResetDialog.close();
  });

  pinResetOk.addEventListener('click', () => {
    pinResetDialog.close();
    controller.executePinReset();
  });

  return {
    applyRuntimeHealth(health: HostRuntimeHealth): void {
      controller.applyRuntimeHealth(health);
    },
    applyConfigSnapshot(status: HostStatus): void {
      controller.applyConfigSnapshot(status);
    },
    show(status: HostStatus): void {
      root.hidden = false;
      setupLogsSelect();
      controller.show(status);
    },
    hide(): void {
      root.hidden = true;
      viewLoading.setLoading(false);
      controller.clearError();
    },
    setLoading: viewLoading.setLoading,
  };
}
