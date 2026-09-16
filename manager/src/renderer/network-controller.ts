import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type {
  HostNetworkInput,
  HostNetworkResult,
  HostStatus,
  NetworkSnapshot,
} from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import type { LanIpFieldState, ProxyFieldState } from './host-network-panels.js';
import {
  hostNetworkChanged,
  networkDraftEquals,
  snapshotNetworkDraft,
} from './host-network-panels.js';
import { effectiveCompose } from './host-snapshot-selectors.js';
import {
  formatActiveReachabilityResult,
  NETWORK_LAN_REQUIRED_ERROR,
  NETWORK_PROBE_FAILED_MESSAGE,
  NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE,
  NETWORK_STACK_STOPPED_VERIFY_HINT,
  networkIsBusy,
  networkProxyMissingAfterRestart,
  networkProxyStartFailureMessage,
  networkRestartConfirmMessage,
  networkRestartFailureMessage,
  networkSavedWhileStoppedMessage,
  proxyNeedsRestore,
  savedDeviceBaseUrl,
  type NetworkDraft,
  type NetworkNotice,
  type NetworkPhase,
} from './network-view-model.js';
import { draftCanonicalBaseUrl, isHttpOrigin } from './reachability.js';
import { pollSetupProbes } from './setup-probes.js';
import { createHostNetworkFields, resolvedLanIp } from './wizard-state.js';
import { DISABLED_GATEWAY_PLAN } from './wizard-flow.js';

export type NetworkCallbacks = {
  onAfterMutation?: () => void | Promise<void>;
};

/** Local network-tab state: draft + phase/notice + network snapshot. No config/runtime copies. */
export type NetworkState = NetworkDraft & {
  network: NetworkSnapshot | null;
  phase: NetworkPhase;
  notice: NetworkNotice | null;
};

export type NetworkControllerDeps = NetworkCallbacks & {
  api: PraxisManagerApi;
  getConfig: () => HostStatus | null;
  getRuntime: () => HostRuntimeHealth | null;
  onStateChange?: () => void;
  requestConfirm: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
  /** True while TLS (or hydrate replay) is writing the host. */
  isPeerMutating?: () => boolean;
  /** Override probe polling (tests / shorter LAN grace). */
  verifyProbeOptions?: {
    maxWaitMs?: number;
    intervalMs?: number;
    lanGraceMs?: number;
  };
};

export type NetworkController = {
  getState: () => Readonly<NetworkState>;
  patchFields: (patch: Partial<LanIpFieldState & ProxyFieldState>) => void;
  applyAndVerify: () => void;
  restoreProxy: () => void;
  /** Probe an already-saved device base URL (never the draft). */
  verifyActiveConfiguration: (baseUrl?: string | null) => void;
  /** Open tab: hydrate draft from config and load network snapshot. */
  show: () => void;
  hide: () => void;
  /**
   * Config snapshot changed. Hydrates when the draft is untouched since last baseline
   * or unchanged since save start; otherwise the user draft wins.
   * Safe while busy — queues until phase returns to idle.
   */
  syncFromConfig: () => void;
  /** Explicit discard: rehydrate from current config (idle only). */
  discardDraft: () => void;
  /** Host write still running, even if hide() already reset the UI phase. */
  isHostWriteInFlight: () => boolean;
};

function createInitialState(): NetworkState {
  return {
    network: null,
    lanAppIp: '__custom__',
    customLanIp: '',
    proxyEnabled: false,
    phase: 'idle',
    notice: null,
  };
}

function noticeFromVerified(verified: { ok: boolean; message: string }): NetworkNotice {
  return { tone: verified.ok ? 'success' : 'error', message: verified.message };
}

/** Started TLS owns Canonical and proxy mode; `/host/network` may then save LAN only. */
export function hostNetworkMustPreserveTlsIdentity(config: HostStatus | null): boolean {
  return Boolean(config?.tls && (config.tls.state !== 'off' || config.tls.cutoverApplied === true));
}

export function buildHostNetworkSaveInput(input: {
  lanAppIp: string;
  restartCompose: boolean;
  repairProxy?: boolean;
  proxyEnabled: boolean;
  preserveTlsIdentity: boolean;
}): HostNetworkInput {
  return {
    lanAppIp: input.lanAppIp,
    restartCompose: input.restartCompose,
    repairProxy: input.repairProxy || undefined,
    gateway: DISABLED_GATEWAY_PLAN,
    ...(input.preserveTlsIdentity
      ? {}
      : {
          proxy: {
            enabled: input.proxyEnabled,
            httpPort: 80,
          },
        }),
  };
}

function draftFromConfig(config: HostStatus): NetworkDraft {
  const fields = createHostNetworkFields(config);
  return {
    lanAppIp: fields.lanAppIp,
    customLanIp: fields.customLanIp,
    proxyEnabled: fields.proxyEnabled,
  };
}

/**
 * Network tab controller — draft + apply/verify/repair only.
 * Config and runtime are read via getters; never stored on the controller.
 * Hydration baseline is a normalized NetworkDraft, not a HostStatus copy.
 */
export function createNetworkController(deps: NetworkControllerDeps): NetworkController {
  const state = createInitialState();
  /** Bumped on each show()/hide() so stale fetchSetupNetwork responses are ignored. */
  let showGeneration = 0;
  /** Bumped to drop in-flight save/verify work after hide. */
  let actionGeneration = 0;
  /** Last successfully applied draft baseline (normalized fields only). */
  let draftBaseline: NetworkDraft | null = null;
  /** Draft as submitted at save start — hydrate after config refresh if still equal. */
  let saveSubmittedDraft: NetworkDraft | null = null;
  /** Config arrived while busy; flush when phase returns to idle. */
  let pendingConfigHydrate = false;
  /** Survives hide()/idle so TLS cannot start while saveHostNetwork is still in flight. */
  let hostWriteInFlight = 0;

  function hostLockedByPeer(): boolean {
    return Boolean(deps.isPeerMutating?.());
  }

  function beginHostWrite(): void {
    hostWriteInFlight += 1;
    notify();
  }

  function endHostWrite(): void {
    if (hostWriteInFlight > 0) {
      hostWriteInFlight -= 1;
    }
    notify();
  }

  function notify(): void {
    deps.onStateChange?.();
  }

  function patch(partial: Partial<NetworkState>): void {
    Object.assign(state, partial);
    notify();
  }

  function currentDraftSnapshot(): NetworkDraft {
    return snapshotNetworkDraft(state);
  }

  function applyDraft(draft: NetworkDraft, options: { clearSaveMarker?: boolean } = {}): void {
    patch({ ...draft });
    draftBaseline = snapshotNetworkDraft(draft);
    if (options.clearSaveMarker !== false) {
      saveSubmittedDraft = null;
    }
  }

  function tryHydrateFromConfig(config: HostStatus): void {
    const next = draftFromConfig(config);
    if (saveSubmittedDraft) {
      if (!networkDraftEquals(currentDraftSnapshot(), saveSubmittedDraft)) {
        // User edited after save started — keep their draft.
        return;
      }
      applyDraft(next);
      return;
    }
    if (draftBaseline && !networkDraftEquals(currentDraftSnapshot(), draftBaseline)) {
      return;
    }
    applyDraft(next);
  }

  function flushPendingConfigHydrate(): void {
    if (!pendingConfigHydrate) {
      return;
    }
    pendingConfigHydrate = false;
    const config = deps.getConfig();
    if (config) {
      tryHydrateFromConfig(config);
    }
  }

  function setPhase(phase: NetworkPhase): void {
    patch({ phase, ...(phase !== 'idle' ? { notice: null } : {}) });
    if (phase === 'idle') {
      flushPendingConfigHydrate();
    }
  }

  function setErrorNotice(message: string): void {
    patch({ phase: 'idle', notice: { tone: 'error', message } });
    flushPendingConfigHydrate();
  }

  function setWarningNotice(message: string): void {
    patch({ phase: 'idle', notice: { tone: 'warning', message } });
    flushPendingConfigHydrate();
  }

  function resolveDraftCanonical(): string | null {
    return draftCanonicalBaseUrl(state, deps.getConfig());
  }

  /** Apply button: field drift or leftover gateway cleanup. */
  function needsApply(): boolean {
    return hostNetworkChanged(state, deps.getConfig());
  }

  function stackRunning(): boolean {
    const compose = effectiveCompose(deps.getConfig(), deps.getRuntime());
    // `running` summarizes health of all expected services. A partially running
    // stack still needs recreation when bindings or proxy mode change.
    return Boolean(
      compose?.running ||
        compose?.services.some((service) => service.state.toLowerCase().includes('running')),
    );
  }

  async function verifySavedBaseUrl(
    baseUrl: string,
    generation: number,
  ): Promise<{ ok: boolean; message: string }> {
    setPhase('checking');
    try {
      const probes = await pollSetupProbes(
        deps.api,
        {
          localAppBaseUrl: 'http://127.0.0.1:8080',
          lanAppBaseUrl: baseUrl,
        },
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
      setErrorNotice(NETWORK_LAN_REQUIRED_ERROR);
      return;
    }

    const config = deps.getConfig();
    if (!config) {
      return;
    }
    const preserveTlsIdentity = hostNetworkMustPreserveTlsIdentity(config);
    const tlsCutoverApplied = config.tls?.cutoverApplied === true;
    const canonicalBaseUrl = preserveTlsIdentity
      ? config.configuredCanonicalBaseUrl?.trim() || config.appBaseUrl.trim()
      : resolveDraftCanonical();
    if (!canonicalBaseUrl) {
      setErrorNotice('Keine gespeicherte Geräte-Adresse vorhanden.');
      return;
    }
    if (tlsCutoverApplied && !canonicalBaseUrl.startsWith('https://')) {
      setErrorNotice('Aktives HTTPS hat keine gültige gespeicherte HTTPS-Adresse.');
      return;
    }
    if (!preserveTlsIdentity && !isHttpOrigin(canonicalBaseUrl)) {
      setErrorNotice('Bitte eine gültige IP-Adresse für die Praxisgeräte wählen.');
      return;
    }

    const proxyEnabled = state.proxyEnabled;
    saveSubmittedDraft = currentDraftSnapshot();
    beginHostWrite();
    try {
      setPhase(input.repairProxy || input.restartCompose ? 'restarting' : 'saving');

      let result: HostNetworkResult;
      try {
        if (!input.restartCompose) {
          setPhase('saving');
        }
        result = await deps.api.saveHostNetwork(
          buildHostNetworkSaveInput({
            lanAppIp,
            restartCompose: input.restartCompose,
            repairProxy: input.repairProxy,
            proxyEnabled,
            preserveTlsIdentity,
          }),
        );
      } catch (error) {
        if (generation !== actionGeneration) {
          return;
        }
        saveSubmittedDraft = null;
        // The backend may have persisted the proxy setting before a restart or
        // the request failed. Refresh the saved config so HTTPS eligibility does
        // not remain stale until the next tab navigation.
        try {
          await deps.onAfterMutation?.();
        } catch {
          // Keep the original save error if the refresh also fails.
        }
        if (generation !== actionGeneration) {
          return;
        }
        setErrorNotice(
          error instanceof Error ? error.message : 'Netzwerk konnte nicht gespeichert werden.',
        );
        return;
      }

      if (generation !== actionGeneration) {
        return;
      }

      await deps.onAfterMutation?.();
      if (generation !== actionGeneration) {
        return;
      }

      // Env already written — keep saveSubmittedDraft so a following config refresh
      // can still hydrate server-normalized values even if restart/proxy start failed.
      if (input.restartCompose && !result.composeRestarted) {
        setErrorNotice(
          input.repairProxy
            ? networkProxyStartFailureMessage()
            : networkRestartFailureMessage(result),
        );
        return;
      }

      if (input.repairProxy || (proxyEnabled && input.restartCompose)) {
        if (networkProxyMissingAfterRestart(result, proxyEnabled)) {
          setErrorNotice(networkProxyStartFailureMessage());
          return;
        }
      }

      if (!result.stackWasRunning && !result.composeRestarted) {
        setWarningNotice(networkSavedWhileStoppedMessage());
        return;
      }

      const savedUrl = result.deviceUrls.appBaseUrl?.trim() || canonicalBaseUrl;
      const verified = await verifySavedBaseUrl(savedUrl, generation);
      if (generation !== actionGeneration || !verified.message) {
        return;
      }
      patch({ phase: 'idle', notice: noticeFromVerified(verified) });
      flushPendingConfigHydrate();
    } finally {
      endHostWrite();
    }
  }

  return {
    getState: () => state,

    patchFields(patchFields) {
      const clearsNotice =
        'proxyEnabled' in patchFields || 'lanAppIp' in patchFields || 'customLanIp' in patchFields;
      patch({
        ...patchFields,
        ...(clearsNotice && state.notice ? { phase: 'idle' as const, notice: null } : {}),
      });
    },

    applyAndVerify() {
      if (networkIsBusy(state.phase) || hostWriteInFlight > 0 || hostLockedByPeer()) {
        return;
      }
      if (!needsApply()) {
        return;
      }

      const config = deps.getConfig();
      const proxyChanging = Boolean(state.proxyEnabled) !== Boolean(config?.proxy?.enabled);

      if (stackRunning()) {
        deps.requestConfirm(networkRestartConfirmMessage(proxyChanging), () => {
          if (networkIsBusy(state.phase) || hostLockedByPeer()) {
            return;
          }
          void saveAndMaybeVerify({ restartCompose: true });
        });
        return;
      }

      void saveAndMaybeVerify({ restartCompose: false });
    },

    restoreProxy() {
      if (networkIsBusy(state.phase) || hostWriteInFlight > 0 || hostLockedByPeer()) {
        return;
      }
      if (needsApply()) {
        setErrorNotice(
          'Bitte zuerst die Änderungen übernehmen oder verwerfen. Wiederherstellen verwendet die gespeicherte Einrichtung.',
        );
        return;
      }
      if (!proxyNeedsRestore(deps.getConfig(), deps.getRuntime())) {
        setErrorNotice('Proxy-Dienst läuft bereits oder ist nicht aktiviert.');
        return;
      }
      if (!state.proxyEnabled) {
        setErrorNotice('Bitte den Zugriff über die ausgewählte Adresse aktiviert lassen.');
        return;
      }
      deps.requestConfirm(NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE, () => {
        if (networkIsBusy(state.phase) || hostLockedByPeer()) {
          return;
        }
        void saveAndMaybeVerify({ restartCompose: true, repairProxy: true });
      });
    },

    verifyActiveConfiguration(baseUrl) {
      if (networkIsBusy(state.phase) || hostLockedByPeer()) {
        return;
      }
      if (!stackRunning()) {
        setErrorNotice(NETWORK_STACK_STOPPED_VERIFY_HINT);
        return;
      }
      const url = (baseUrl ?? savedDeviceBaseUrl(deps.getConfig()))?.trim() || '';
      if (!url) {
        setErrorNotice('Keine gespeicherte Geräte-Adresse — bitte zuerst übernehmen.');
        return;
      }

      const generation = ++actionGeneration;
      void verifySavedBaseUrl(url, generation).then((verified) => {
        if (generation !== actionGeneration || !verified.message) {
          return;
        }
        patch({ phase: 'idle', notice: noticeFromVerified(verified) });
        flushPendingConfigHydrate();
      });
    },

    show() {
      if (!deps.getConfig()) {
        return;
      }
      const generation = ++showGeneration;
      actionGeneration += 1;
      saveSubmittedDraft = null;
      pendingConfigHydrate = false;

      const openingConfig = deps.getConfig()!;
      const openingDraft = draftFromConfig(openingConfig);
      patch({
        phase: 'loading',
        notice: null,
        network: null,
        ...openingDraft,
      });
      draftBaseline = snapshotNetworkDraft(openingDraft);

      void deps.api
        .fetchSetupNetwork()
        .then((network) => {
          if (generation !== showGeneration) {
            return;
          }
          // Always re-read config — a newer snapshot may have arrived during fetch.
          const config = deps.getConfig() ?? openingConfig;
          const draft = draftFromConfig(config);
          patch({
            network,
            ...draft,
            phase: 'idle',
            notice: null,
          });
          draftBaseline = snapshotNetworkDraft(draft);
          pendingConfigHydrate = false;
        })
        .catch((error) => {
          if (generation !== showGeneration) {
            return;
          }
          setErrorNotice(
            error instanceof Error ? error.message : 'Netzwerkdaten konnten nicht geladen werden.',
          );
        });
    },

    hide() {
      showGeneration += 1;
      actionGeneration += 1;
      draftBaseline = null;
      saveSubmittedDraft = null;
      pendingConfigHydrate = false;
      patch({
        phase: 'idle',
        notice: null,
      });
    },

    syncFromConfig() {
      const config = deps.getConfig();
      if (!config) {
        return;
      }
      if (networkIsBusy(state.phase)) {
        pendingConfigHydrate = true;
        return;
      }
      tryHydrateFromConfig(config);
    },

    discardDraft() {
      const config = deps.getConfig();
      if (!config || networkIsBusy(state.phase) || hostWriteInFlight > 0 || hostLockedByPeer()) {
        return;
      }
      saveSubmittedDraft = null;
      pendingConfigHydrate = false;
      const draft = draftFromConfig(config);
      applyDraft(draft);
      patch({ notice: null });
    },

    isHostWriteInFlight() {
      return hostWriteInFlight > 0;
    },
  };
}
