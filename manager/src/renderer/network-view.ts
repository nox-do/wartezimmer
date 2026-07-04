import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { ComposeStatus, HostStatus, NetworkSnapshot } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { formatEnvBackupLabel } from '@praxis-flow/server-shared';
import { hostNetworkChanged, renderGatewayPanel, renderLanIpPanel } from './host-network-panels.js';
import { mountNetworkTopologyDiagram } from './network-topology-diagram.js';
import { renderNetworkBindingChecks } from './network-binding-checks.js';
import {
  buildGatewayPlanInput,
  createHostNetworkFields,
  gatewayBridgeDefaultsFromNetwork,
  resolvedLanIp,
  validateGatewayAuthBridgeUrl,
} from './wizard-state.js';
import { queryRequired } from './dom.js';
import { createViewLoadingOverlay } from './view-loading.js';

export type NetworkViewCallbacks = {
  onBack: () => void;
  onAfterMutation?: () => void;
};

type NetworkViewState = {
  status: HostStatus | null;
  network: NetworkSnapshot | null;
  compose: ComposeStatus | null;
  networkStatusText: string;
  lanAppIp: string;
  customLanIp: string;
  gatewayEnabled: boolean;
  gatewayInterface: string;
  gatewayIp: string;
  portalAppIp: string;
  authBridgeUrl: string;
  busy: boolean;
  error: string | null;
};

export function createNetworkView(
  root: HTMLElement,
  api: PraxisManagerApi,
  callbacks: NetworkViewCallbacks,
) {
  const diagramHost = queryRequired<HTMLElement>(root, '#network-diagram', 'Netzwerk-UI');
  const bindingsHost = queryRequired<HTMLElement>(root, '#network-bindings-panel', 'Netzwerk-UI');
  const lanPanelHost = queryRequired<HTMLElement>(root, '#network-lan-panel', 'Netzwerk-UI');
  const gatewayPanelHost = queryRequired<HTMLElement>(
    root,
    '#network-gateway-panel',
    'Netzwerk-UI',
  );
  const networkWarning = queryRequired<HTMLElement>(root, '#network-warning', 'Netzwerk-UI');
  const networkApplyBtn = queryRequired<HTMLButtonElement>(root, '#network-apply', 'Netzwerk-UI');
  const networkStatus = queryRequired<HTMLElement>(root, '#network-status', 'Netzwerk-UI');
  const errorEl = queryRequired<HTMLElement>(root, '#network-error', 'Netzwerk-UI');
  const backBtn = queryRequired<HTMLButtonElement>(root, '#network-back', 'Netzwerk-UI');
  const confirmDialog = queryRequired<HTMLDialogElement>(root, '#network-confirm', 'Netzwerk-UI');
  const confirmMessage = queryRequired<HTMLElement>(
    root,
    '#network-confirm-message',
    'Netzwerk-UI',
  );
  const confirmOk = queryRequired<HTMLButtonElement>(root, '#network-confirm-ok', 'Netzwerk-UI');
  const confirmCancel = queryRequired<HTMLButtonElement>(
    root,
    '#network-confirm-cancel',
    'Netzwerk-UI',
  );

  const viewLoading = createViewLoadingOverlay(root);

  const state: NetworkViewState = {
    status: null,
    network: null,
    compose: null,
    networkStatusText: '',
    lanAppIp: '__custom__',
    customLanIp: '',
    gatewayEnabled: false,
    gatewayInterface: 'eth1',
    gatewayIp: '192.168.88.1',
    portalAppIp: '',
    authBridgeUrl: '',
    busy: false,
    error: null,
  };

  let pendingConfirmAction: (() => void) | null = null;

  function setBusy(busy: boolean): void {
    state.busy = busy;
    for (const button of [backBtn, networkApplyBtn, confirmOk, confirmCancel]) {
      button.disabled = busy;
    }
    renderPanels();
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

  function renderDiagram(): void {
    mountNetworkTopologyDiagram(diagramHost, {
      lanIp: resolvedLanIp(state) || state.status?.network.configuredLanIp,
      gatewayIp: state.gatewayEnabled ? state.gatewayIp : null,
      gatewayEnabled: state.gatewayEnabled,
    });
    renderNetworkBindingChecks(bindingsHost, state.status?.networkBindings);
  }

  function renderNetworkWarning(): void {
    const running = state.compose?.running ?? false;
    const changed = hostNetworkChanged(state, state.status);
    if (running && changed) {
      networkWarning.hidden = false;
      networkWarning.textContent =
        'Änderungen werden erst nach einem Stack-Neustart wirksam. Beim Übernehmen wird danach gefragt.';
      return;
    }
    networkWarning.hidden = true;
    networkWarning.textContent = '';
  }

  function renderPanels(): void {
    renderDiagram();

    renderLanIpPanel(lanPanelHost, {
      state,
      network: state.network,
      status: state.status,
      disabled: state.busy,
      variant: 'maintenance',
      radioName: 'network-lan-ip',
      onChange: (patch) => {
        Object.assign(state, patch);
        renderNetworkWarning();
        renderDiagram();
      },
      onRerender: () => renderPanels(),
    });

    const renderGateway = () => {
      renderGatewayPanel(gatewayPanelHost, {
        state,
        network: state.network,
        status: state.status,
        lanIpFallback: resolvedLanIp(state),
        disabled: state.busy,
        radioName: 'network-gateway-interface',
        showIntro: false,
        onChange: (patch) => {
          Object.assign(state, patch);
          renderNetworkWarning();
          renderDiagram();
        },
        onRerender: () => renderGateway(),
      });
    };
    renderGateway();

    networkStatus.textContent = state.networkStatusText;
    renderNetworkWarning();
  }

  function openConfirm(message: string, onConfirm: () => void): void {
    pendingConfirmAction = onConfirm;
    confirmMessage.textContent = message;
    confirmDialog.showModal();
  }

  function applyHostNetwork(restartCompose: boolean): void {
    const lanAppIp = resolvedLanIp(state);
    if (!lanAppIp) {
      setError('Bitte eine LAN-IP wählen oder eingeben.');
      return;
    }
    if (state.gatewayEnabled && !state.gatewayInterface.trim()) {
      setError('Bitte ein Netzwerk-Interface für das Gast-LAN wählen.');
      return;
    }
    const bridgeUrlError = validateGatewayAuthBridgeUrl(state.authBridgeUrl);
    if (state.gatewayEnabled && bridgeUrlError) {
      setError(bridgeUrlError);
      return;
    }

    const status = state.status;
    if (!status) {
      return;
    }

    setBusy(true);
    setError(null);
    state.networkStatusText = 'Speichern …';
    renderPanels();

    void api
      .saveHostNetwork({
        lanAppIp,
        restartCompose,
        gateway: buildGatewayPlanInput(state),
      })
      .then(async (result) => {
        const parts = ['Netzwerk-Konfiguration gespeichert.'];
        if (result.backupPath) {
          parts.push(`Backup: ${formatEnvBackupLabel(result.backupPath)}`);
        }
        if (result.gatewayComposeSkipped) {
          parts.push(
            'Gateway-Dienst auf diesem Praxis-PC übersprungen; Werte für separates Linux-Gateway gespeichert.',
          );
        }
        if (result.compose) {
          state.compose = result.compose;
        }
        if (result.composeRestarted) {
          parts.push('Stack neu gestartet.');
        } else if (result.stackWasRunning && restartCompose) {
          parts.push('Stack-Neustart fehlgeschlagen.');
          setError(result.restartLog || 'Docker Compose fehlgeschlagen.');
        }
        state.networkStatusText = parts.join(' ');

        callbacks.onAfterMutation?.();
      })
      .catch((error) => {
        state.networkStatusText = '';
        renderPanels();
        setError(
          error instanceof Error ? error.message : 'Netzwerk konnte nicht gespeichert werden.',
        );
      })
      .finally(() => setBusy(false));
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

  networkApplyBtn.addEventListener('click', () => {
    if (!hostNetworkChanged(state, state.status)) {
      setError('Keine Änderungen an LAN oder Gateway.');
      return;
    }

    if ((state.compose?.running ?? false) && hostNetworkChanged(state, state.status)) {
      openConfirm(
        'Einstellungen werden in die .env geschrieben. Stack jetzt neu starten, damit Container und URLs greifen?',
        () => applyHostNetwork(true),
      );
      return;
    }

    applyHostNetwork(false);
  });

  backBtn.addEventListener('click', () => {
    callbacks.onBack();
  });

  return {
    applyRuntimeHealth(health: HostRuntimeHealth): void {
      state.compose = health.compose;
      renderNetworkWarning();
    },
    applyConfigSnapshot(status: HostStatus): void {
      const dirty = hostNetworkChanged(state, state.status);
      state.status = status;
      if (!dirty && !state.busy) {
        Object.assign(state, createHostNetworkFields(status));
        renderPanels();
        return;
      }
      renderNetworkWarning();
      renderDiagram();
    },
    show(status: HostStatus): void {
      root.hidden = false;
      state.status = status;
      state.compose = status.compose;
      state.networkStatusText = '';
      Object.assign(state, createHostNetworkFields(status));
      state.error = null;
      renderPanels();
      setBusy(true);
      void api
        .fetchSetupNetwork()
        .then((network) => {
          state.network = network;
          Object.assign(state, gatewayBridgeDefaultsFromNetwork(state, network));
          renderPanels();
        })
        .catch((error) => {
          setError(
            error instanceof Error ? error.message : 'Netzwerkdaten konnten nicht geladen werden.',
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
