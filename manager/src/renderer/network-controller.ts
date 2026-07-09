import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { ComposeStatus, HostStatus, NetworkSnapshot } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import type { GatewayFieldState, LanIpFieldState } from './host-network-panels.js';
import { hostNetworkChanged } from './host-network-panels.js';
import {
  NETWORK_GATEWAY_INTERFACE_ERROR,
  NETWORK_LAN_REQUIRED_ERROR,
  NETWORK_NO_CHANGES_ERROR,
  NETWORK_RESTART_CONFIRM_MESSAGE,
  NETWORK_SAVE_PROGRESS_TEXT,
  networkSaveErrorText,
  networkSaveStatusText,
} from './network-view-model.js';
import {
  buildGatewayPlanInput,
  createHostNetworkFields,
  gatewayDraftDefaults,
  resolvedLanIp,
  validateGatewayAuthBridgeUrl,
} from './wizard-state.js';

export type NetworkCallbacks = {
  onAfterMutation?: () => void;
};

export type NetworkState = LanIpFieldState &
  GatewayFieldState & {
    status: HostStatus | null;
    network: NetworkSnapshot | null;
    compose: ComposeStatus | null;
    networkStatusText: string;
    busy: boolean;
    error: string | null;
  };

export type NetworkControllerDeps = NetworkCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
  requestConfirm: (message: string, onConfirm: () => void) => void;
};

export type NetworkController = {
  getState: () => Readonly<NetworkState>;
  patchFields: (patch: Partial<LanIpFieldState & GatewayFieldState>) => void;
  apply: () => void;
  show: (status: HostStatus) => void;
  hide: () => void;
  clearError: () => void;
  applyConfigSnapshot: (status: HostStatus) => void;
  applyRuntimeHealth: (health: HostRuntimeHealth) => void;
};

function createInitialState(): NetworkState {
  return {
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
}

export function createNetworkController(deps: NetworkControllerDeps): NetworkController {
  const state = createInitialState();

  function notify(): void {
    deps.onStateChange?.();
  }

  function patch(partial: Partial<NetworkState>): void {
    Object.assign(state, partial);
    notify();
  }

  function setBusy(busy: boolean): void {
    patch({ busy });
  }

  function setError(message: string | null): void {
    patch({ error: message });
  }

  function saveHostNetwork(restartCompose: boolean): void {
    const lanAppIp = resolvedLanIp(state);
    if (!lanAppIp) {
      setError(NETWORK_LAN_REQUIRED_ERROR);
      return;
    }
    if (state.gatewayEnabled && !state.gatewayInterface.trim()) {
      setError(NETWORK_GATEWAY_INTERFACE_ERROR);
      return;
    }
    const bridgeUrlError = validateGatewayAuthBridgeUrl(state.authBridgeUrl);
    if (state.gatewayEnabled && bridgeUrlError) {
      setError(bridgeUrlError);
      return;
    }

    if (!state.status) {
      return;
    }

    setBusy(true);
    setError(null);
    patch({ networkStatusText: NETWORK_SAVE_PROGRESS_TEXT });

    void deps.api
      .saveHostNetwork({
        lanAppIp,
        restartCompose,
        gateway: buildGatewayPlanInput(state),
      })
      .then((result) => {
        patch({
          networkStatusText: networkSaveStatusText(result, restartCompose),
          compose: result.compose ?? state.compose,
        });
        const saveError = networkSaveErrorText(result, restartCompose);
        if (saveError) {
          setError(saveError);
        }
        deps.onAfterMutation?.();
      })
      .catch((error) => {
        patch({ networkStatusText: '' });
        setError(
          error instanceof Error ? error.message : 'Netzwerk konnte nicht gespeichert werden.',
        );
      })
      .finally(() => setBusy(false));
  }

  return {
    getState: () => state,

    patchFields(patchFields) {
      patch(patchFields);
    },

    apply() {
      if (!hostNetworkChanged(state, state.status)) {
        setError(NETWORK_NO_CHANGES_ERROR);
        return;
      }

      if ((state.compose?.running ?? false) && hostNetworkChanged(state, state.status)) {
        deps.requestConfirm(NETWORK_RESTART_CONFIRM_MESSAGE, () => saveHostNetwork(true));
        return;
      }

      saveHostNetwork(false);
    },

    show(status) {
      patch({
        status,
        compose: status.compose,
        networkStatusText: '',
        error: null,
        ...createHostNetworkFields(status),
      });
      setBusy(true);
      void deps.api
        .fetchSetupNetwork()
        .then((network) => {
          patch({
            network,
            ...gatewayDraftDefaults(state, network, resolvedLanIp(state)),
          });
        })
        .catch((error) => {
          setError(
            error instanceof Error ? error.message : 'Netzwerkdaten konnten nicht geladen werden.',
          );
        })
        .finally(() => setBusy(false));
    },

    hide() {
      setError(null);
    },

    clearError() {
      setError(null);
    },

    applyConfigSnapshot(status) {
      const dirty = hostNetworkChanged(state, state.status);
      patch({ status });
      if (!dirty && !state.busy) {
        patch(createHostNetworkFields(status));
      }
    },

    applyRuntimeHealth(health) {
      patch({ compose: health.compose });
    },
  };
}
