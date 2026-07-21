import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type {
  ComposeStatus,
  HostNetworkResult,
  HostStatus,
  NetworkSnapshot,
} from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import type { LanIpFieldState, ReachabilityFieldState } from './host-network-panels.js';
import { hostNetworkChanged } from './host-network-panels.js';
import {
  formatActiveReachabilityResult,
  NETWORK_LAN_REQUIRED_ERROR,
  NETWORK_PROBE_FAILED_MESSAGE,
  NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE,
  NETWORK_STACK_STOPPED_VERIFY_HINT,
  networkIsBusy,
  networkOperationProgressText,
  networkProxyMissingAfterRestart,
  networkProxyStartFailureMessage,
  networkRestartConfirmMessage,
  networkRestartFailureMessage,
  networkSavedWhileStoppedMessage,
  type NetworkOperation,
  proxyNeedsRestore,
  savedDeviceBaseUrl,
} from './network-view-model.js';
import {
  draftCanonicalBaseUrl,
  isHttpOrigin,
  matchesHostnameModeBase,
  productPublishPort,
  type ReachabilityMode,
} from './reachability.js';
import { pollSetupProbes } from './setup-probes.js';
import { createHostNetworkFields, resolvedLanIp } from './wizard-state.js';
import { DISABLED_GATEWAY_PLAN } from './wizard-flow.js';

export type NetworkCallbacks = {
  onAfterMutation?: () => void;
};

export type NetworkState = LanIpFieldState &
  ReachabilityFieldState & {
    status: HostStatus | null;
    network: NetworkSnapshot | null;
    compose: ComposeStatus | null;
    operation: NetworkOperation;
    /** Progress / outcome for the primary network action. */
    resultMessage: string | null;
    resultOk: boolean | null;
    error: string | null;
  };

export type NetworkControllerDeps = NetworkCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
  requestConfirm: (message: string, onConfirm: () => void) => void;
  /** Override probe polling (tests / shorter LAN grace). */
  verifyProbeOptions?: {
    maxWaitMs?: number;
    intervalMs?: number;
    lanGraceMs?: number;
  };
};

export type NetworkController = {
  getState: () => Readonly<NetworkState>;
  patchFields: (patch: Partial<LanIpFieldState & ReachabilityFieldState>) => void;
  applyAndVerify: () => void;
  restoreProxy: () => void;
  /** Probe an already-saved device base URL (never the draft). */
  verifyActiveConfiguration: (baseUrl?: string | null) => void;
  show: (status: HostStatus) => void;
  hide: () => void;
  applyConfigSnapshot: (status: HostStatus) => void;
  applyRuntimeHealth: (health: HostRuntimeHealth) => void;
};

function createInitialState(): NetworkState {
  return {
    status: null,
    network: null,
    compose: null,
    lanAppIp: '__custom__',
    customLanIp: '',
    reachabilityMode: 'lan-ip',
    customHostname: '',
    proxyEnabled: false,
    operation: 'idle',
    resultMessage: null,
    resultOk: null,
    error: null,
  };
}

/**
 * Network tab controller — draft fields + applyAndVerify / verifyActiveConfiguration.
 *
 * CAUTION: applyConfigSnapshot preserves dirty drafts; applyRuntimeHealth only
 * patches compose. Session show() resets fields from HostStatus. NetworkView
 * wires three separate shell $effects — keep those semantics if refactoring.
 */
export function createNetworkController(deps: NetworkControllerDeps): NetworkController {
  const state = createInitialState();
  /** Bumped on each show()/hide() so stale fetchSetupNetwork responses are ignored. */
  let showGeneration = 0;
  /** Bumped to drop in-flight save/verify work after hide. */
  let actionGeneration = 0;

  function notify(): void {
    deps.onStateChange?.();
  }

  function patch(partial: Partial<NetworkState>): void {
    Object.assign(state, partial);
    notify();
  }

  function setOperation(operation: NetworkOperation, resultMessage?: string | null): void {
    const progress = networkOperationProgressText(operation);
    patch({
      operation,
      ...(resultMessage !== undefined
        ? { resultMessage }
        : progress
          ? { resultMessage: progress, resultOk: null }
          : {}),
    });
  }

  function resolveDraftCanonical(): string | null {
    return draftCanonicalBaseUrl(state, state.network);
  }

  function isDirty(): boolean {
    return hostNetworkChanged(state, state.status, state.network);
  }

  async function verifySavedBaseUrl(
    baseUrl: string,
    generation: number,
  ): Promise<{ ok: boolean; message: string }> {
    setOperation('checking');
    try {
      const probes = await pollSetupProbes(
        deps.api,
        {
          localAppBaseUrl: 'http://127.0.0.1:8080',
          lanAppBaseUrl: baseUrl,
        },
        // Wait while app comes up; local ok then short LAN grace before accepting LAN red.
        {
          maxWaitMs: 30_000,
          intervalMs: 2_500,
          requireLan: false,
          ...deps.verifyProbeOptions,
        },
      );
      if (generation !== actionGeneration) {
        return { ok: false, message: '' };
      }
      return formatActiveReachabilityResult(probes, baseUrl);
    } catch {
      if (generation !== actionGeneration) {
        return { ok: false, message: '' };
      }
      return { ok: false, message: NETWORK_PROBE_FAILED_MESSAGE };
    }
  }

  async function saveAndMaybeVerify(input: {
    restartCompose: boolean;
    repairProxy?: boolean;
  }): Promise<void> {
    const generation = ++actionGeneration;
    const lanAppIp = resolvedLanIp(state);
    if (!lanAppIp) {
      patch({ operation: 'failed', error: NETWORK_LAN_REQUIRED_ERROR, resultMessage: null, resultOk: false });
      return;
    }

    const canonicalBaseUrl = resolveDraftCanonical();
    if (!canonicalBaseUrl || !isHttpOrigin(canonicalBaseUrl)) {
      patch({
        operation: 'failed',
        error: 'Bitte LAN-IP, Rechnername oder eigenen Hostnamen für die Geräte-Adresse wählen.',
        resultMessage: null,
        resultOk: false,
      });
      return;
    }

    if (!state.status) {
      return;
    }

    const proxyEnabled = state.proxyEnabled;
    setOperation(input.repairProxy || input.restartCompose ? 'restarting' : 'saving');
    patch({ error: null, resultOk: null });

    let result: HostNetworkResult;
    try {
      if (!input.restartCompose) {
        setOperation('saving');
      }
      result = await deps.api.saveHostNetwork({
        lanAppIp,
        restartCompose: input.restartCompose,
        repairProxy: input.repairProxy || undefined,
        canonicalBaseUrl,
        gateway: DISABLED_GATEWAY_PLAN,
        proxy: {
          enabled: proxyEnabled,
          httpPort: 80,
        },
      });
    } catch (error) {
      if (generation !== actionGeneration) {
        return;
      }
      patch({
        operation: 'failed',
        error: error instanceof Error ? error.message : 'Netzwerk konnte nicht gespeichert werden.',
        resultMessage: null,
        resultOk: false,
      });
      return;
    }

    if (generation !== actionGeneration) {
      return;
    }

    patch({ compose: result.compose ?? state.compose });
    deps.onAfterMutation?.();

    // Restart was requested (save-with-restart or proxy repair) but compose did not come up.
    if (input.restartCompose && !result.composeRestarted) {
      patch({
        operation: 'failed',
        error: input.repairProxy
          ? networkProxyStartFailureMessage()
          : networkRestartFailureMessage(result),
        resultMessage: null,
        resultOk: false,
      });
      return;
    }

    if (input.repairProxy || (proxyEnabled && input.restartCompose)) {
      if (networkProxyMissingAfterRestart(result, proxyEnabled)) {
        patch({
          operation: 'failed',
          error: networkProxyStartFailureMessage(),
          resultMessage: null,
          resultOk: false,
        });
        return;
      }
    }

    // Normal save while stack stopped — no restart requested.
    if (!result.stackWasRunning && !result.composeRestarted) {
      patch({
        operation: 'success',
        resultMessage: networkSavedWhileStoppedMessage(),
        resultOk: true,
        error: null,
      });
      return;
    }

    const savedUrl = result.deviceUrls.appBaseUrl?.trim() || canonicalBaseUrl;
    const verified = await verifySavedBaseUrl(savedUrl, generation);
    if (generation !== actionGeneration || !verified.message) {
      return;
    }
    patch({
      operation: verified.ok ? 'success' : 'failed',
      resultMessage: verified.message,
      resultOk: verified.ok,
      error: verified.ok ? null : verified.message,
    });
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
        if (state.operation === 'success' || state.operation === 'failed') {
          patch({ operation: 'idle', resultMessage: null, resultOk: null, error: null });
        }
      }
    },

    applyAndVerify() {
      if (networkIsBusy(state.operation)) {
        return;
      }
      if (!isDirty()) {
        return;
      }

      const proxyChanging = Boolean(state.proxyEnabled) !== Boolean(state.status?.proxy?.enabled);
      const stackRunning = state.compose?.running ?? false;

      if (stackRunning) {
        deps.requestConfirm(networkRestartConfirmMessage(proxyChanging), () => {
          void saveAndMaybeVerify({ restartCompose: true });
        });
        return;
      }

      void saveAndMaybeVerify({ restartCompose: false });
    },

    restoreProxy() {
      if (networkIsBusy(state.operation)) {
        return;
      }
      if (!proxyNeedsRestore(state.status)) {
        patch({
          operation: 'failed',
          error: 'Proxy-Dienst läuft bereits oder ist nicht aktiviert.',
          resultMessage: null,
          resultOk: false,
        });
        return;
      }
      if (!state.proxyEnabled) {
        patch({
          operation: 'failed',
          error: 'Bitte den Zugriff über Port 80 aktiviert lassen und wiederherstellen.',
          resultMessage: null,
          resultOk: false,
        });
        return;
      }
      deps.requestConfirm(NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE, () => {
        void saveAndMaybeVerify({ restartCompose: true, repairProxy: true });
      });
    },

    verifyActiveConfiguration(baseUrl) {
      if (networkIsBusy(state.operation)) {
        return;
      }
      if (!(state.compose?.running ?? false)) {
        patch({
          operation: 'failed',
          error: NETWORK_STACK_STOPPED_VERIFY_HINT,
          resultMessage: NETWORK_STACK_STOPPED_VERIFY_HINT,
          resultOk: false,
        });
        return;
      }
      const url = (baseUrl ?? savedDeviceBaseUrl(state.status))?.trim() || '';
      if (!url) {
        patch({
          operation: 'failed',
          error: 'Keine gespeicherte Geräte-Adresse — bitte zuerst übernehmen.',
          resultMessage: null,
          resultOk: false,
        });
        return;
      }

      const generation = ++actionGeneration;
      patch({ error: null });
      void verifySavedBaseUrl(url, generation).then((verified) => {
        if (generation !== actionGeneration || !verified.message) {
          return;
        }
        patch({
          operation: verified.ok ? 'success' : 'failed',
          resultMessage: verified.message,
          resultOk: verified.ok,
          error: verified.ok ? null : verified.message,
        });
      });
    },

    show(status) {
      const generation = ++showGeneration;
      actionGeneration += 1;
      patch({
        status,
        compose: status.compose,
        operation: 'loading',
        resultMessage: networkOperationProgressText('loading'),
        resultOk: null,
        error: null,
        ...createHostNetworkFields(status),
      });
      void deps.api
        .fetchSetupNetwork()
        .then((network) => {
          if (generation !== showGeneration) {
            return;
          }
          const fields = { ...state, ...createHostNetworkFields(status) };
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
            operation: 'idle',
            resultMessage: null,
          });
        })
        .catch((error) => {
          if (generation !== showGeneration) {
            return;
          }
          patch({
            operation: 'failed',
            error:
              error instanceof Error ? error.message : 'Netzwerkdaten konnten nicht geladen werden.',
            resultMessage: null,
            resultOk: false,
          });
        });
    },

    hide() {
      showGeneration += 1;
      actionGeneration += 1;
      patch({
        operation: 'idle',
        error: null,
        resultMessage: null,
        resultOk: null,
      });
    },

    applyConfigSnapshot(status) {
      const dirty = isDirty();
      patch({ status });
      if (!dirty && !networkIsBusy(state.operation)) {
        patch(createHostNetworkFields(status));
      }
    },

    applyRuntimeHealth(health) {
      patch({ compose: health.compose });
    },
  };
}
