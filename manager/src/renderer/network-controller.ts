import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type {
  ComposeStatus,
  HostStatus,
  NetworkSnapshot,
  ProbeResult,
} from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import type {
  GatewayFieldState,
  LanIpFieldState,
  ReachabilityFieldState,
} from './host-network-panels.js';
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
  draftCanonicalBaseUrl,
  isHttpOrigin,
  matchesHostnameModeBase,
  productPublishPort,
  type ReachabilityMode,
} from './reachability.js';
import {
  buildGatewayPlanInput,
  createHostNetworkFields,
  gatewayDraftDefaults,
  resolvedLanIp,
  validateGatewayManagementIpForUi,
} from './wizard-state.js';

export type NetworkCallbacks = {
  onAfterMutation?: () => void;
};

export type NetworkState = LanIpFieldState &
  GatewayFieldState &
  ReachabilityFieldState & {
    status: HostStatus | null;
    network: NetworkSnapshot | null;
    compose: ComposeStatus | null;
    networkStatusText: string;
    busy: boolean;
    error: string | null;
    reachabilityProbeBusy: boolean;
    reachabilityProbeMessage: string | null;
    reachabilityProbeOk: boolean | null;
  };

export type NetworkControllerDeps = NetworkCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
  requestConfirm: (message: string, onConfirm: () => void) => void;
};

export type NetworkController = {
  getState: () => Readonly<NetworkState>;
  patchFields: (
    patch: Partial<LanIpFieldState & GatewayFieldState & ReachabilityFieldState>,
  ) => void;
  apply: () => void;
  testReachability: () => void;
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
    gatewayManagementIp: '',
    reachabilityMode: 'lan-ip',
    customHostname: '',
    proxyEnabled: false,
    busy: false,
    error: null,
    reachabilityProbeBusy: false,
    reachabilityProbeMessage: null,
    reachabilityProbeOk: null,
  };
}

function lanProbeSummary(probes: ProbeResult[]): { ok: boolean | null; message: string | null } {
  const lan = probes.find((probe) => probe.id === 'app.health.lan');
  if (!lan) {
    return { ok: null, message: 'Keine Praxisnetz-Prüfung möglich (keine Basis-URL).' };
  }
  return { ok: lan.ok, message: lan.message };
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

  function resolveCanonicalForSave(): string | null {
    return draftCanonicalBaseUrl(state, state.network);
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
    const managementIpError = validateGatewayManagementIpForUi(
      state.gatewayManagementIp,
      state,
      state.network,
    );
    if (state.gatewayEnabled && managementIpError) {
      setError(managementIpError);
      return;
    }

    const canonicalBaseUrl = resolveCanonicalForSave();
    if (!canonicalBaseUrl || !isHttpOrigin(canonicalBaseUrl)) {
      setError('Erreichbarkeit: bitte LAN-IP, Rechnername oder eigenen Hostnamen wählen.');
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
        canonicalBaseUrl,
        gateway: buildGatewayPlanInput(state),
        proxy: {
          enabled: state.proxyEnabled,
          httpPort: 80,
        },
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
      if (
        'reachabilityMode' in patchFields ||
        'customHostname' in patchFields ||
        'proxyEnabled' in patchFields ||
        'lanAppIp' in patchFields ||
        'customLanIp' in patchFields
      ) {
        patch({
          reachabilityProbeMessage: null,
          reachabilityProbeOk: null,
        });
      }
    },

    apply() {
      if (!hostNetworkChanged(state, state.status, state.network)) {
        setError(NETWORK_NO_CHANGES_ERROR);
        return;
      }

      if (
        (state.compose?.running ?? false) &&
        hostNetworkChanged(state, state.status, state.network)
      ) {
        deps.requestConfirm(NETWORK_RESTART_CONFIRM_MESSAGE, () => saveHostNetwork(true));
        return;
      }

      saveHostNetwork(false);
    },

    testReachability() {
      const lanAppBaseUrl = resolveCanonicalForSave();
      if (!lanAppBaseUrl) {
        patch({
          reachabilityProbeOk: false,
          reachabilityProbeMessage:
            'Keine Basis-URL — LAN-IP wählen oder Hostname/Domain eintragen.',
        });
        return;
      }

      patch({
        reachabilityProbeBusy: true,
        reachabilityProbeMessage: `Prüfe ${lanAppBaseUrl} …`,
        reachabilityProbeOk: null,
        error: null,
      });

      void deps.api
        .runSetupProbes({
          localAppBaseUrl: 'http://127.0.0.1:8080',
          lanAppBaseUrl,
        })
        .then((result) => {
          const summary = lanProbeSummary(result.probes);
          const local = result.probes.find((probe) => probe.id === 'app.health.local');
          if (local && !local.ok) {
            patch({
              reachabilityProbeOk: false,
              reachabilityProbeMessage: `Lokal nicht erreichbar — ${local.message}`,
            });
            return;
          }
          if (summary.ok === false) {
            patch({
              reachabilityProbeOk: false,
              reachabilityProbeMessage: `${summary.message ?? 'Nicht erreichbar'} — bei Hostname-Problemen LAN-IP verwenden.`,
            });
            return;
          }
          patch({
            reachabilityProbeOk: true,
            reachabilityProbeMessage: summary.message ?? `Erreichbar: ${lanAppBaseUrl}`,
          });
        })
        .catch((error) => {
          patch({
            reachabilityProbeOk: false,
            reachabilityProbeMessage:
              error instanceof Error ? error.message : 'Erreichbarkeitstest fehlgeschlagen.',
          });
        })
        .finally(() => patch({ reachabilityProbeBusy: false }));
    },

    show(status) {
      patch({
        status,
        compose: status.compose,
        networkStatusText: '',
        error: null,
        reachabilityProbeMessage: null,
        reachabilityProbeOk: null,
        ...createHostNetworkFields(status),
      });
      setBusy(true);
      void deps.api
        .fetchSetupNetwork()
        .then((network) => {
          const fields = { ...state, ...createHostNetworkFields(status) };
          // Prefer hostname mode only for the exact hostname-mode URL (http://host:8080).
          let reachabilityMode: ReachabilityMode = fields.reachabilityMode;
          let customHostname = fields.customHostname;
          const host = network.machineHostname?.trim();
          const configured = status.configuredCanonicalBaseUrl?.trim();
          if (matchesHostnameModeBase(configured, host, productPublishPort(fields.proxyEnabled))) {
            reachabilityMode = 'hostname';
            customHostname = '';
          }
          patch({
            network,
            reachabilityMode,
            customHostname,
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
      const dirty = hostNetworkChanged(state, state.status, state.network);
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
