import { hasBlockingMaintenanceOperation } from '@wartezimmer/server-shared/manager-status-projection';
import type {
  HostStatus,
  TlsDnsCheck,
  TlsLocalCheck,
  TlsOperatorRequest,
  TlsStatus,
} from '../shared/host-status.js';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';
import {
  evaluateHostLifecycleAction,
  type HostLifecycleAction,
} from '@wartezimmer/server-shared/host-lifecycle-policy';
import {
  tlsModeForNameMode,
  tlsNameValid,
  tlsPrepareHostname,
  type TlsNameMode,
} from './tls-identity.js';
import {
  TLS_CUTOVER_CONFIRM_MESSAGE,
  TLS_LEASE_STALE_LAN_COPY,
  TLS_RESET_CONFIRM_MESSAGE,
  tlsLeaseBlockedByStaleLan,
  tlsOperatorRecordsAreTheTask,
} from './tls-network-view-model.js';

export type TlsLocalAction =
  | { kind: 'idle' | 'hydrating' }
  | {
      kind: 'running';
      name: 'prepare' | 'dns' | 'obtain' | 'apply' | 'repair' | 'reset' | 'renew' | 'stage';
    }
  | { kind: 'failed'; error: string };

export function tlsNetworkLocksHost(state: Pick<TlsNetworkState, 'action'>): boolean {
  return state.action.kind === 'running' || state.action.kind === 'hydrating';
}
export function tlsNetworkPendingObtain(state: Pick<TlsNetworkState, 'action'>): boolean {
  return state.action.kind === 'running' && state.action.name === 'obtain';
}
export function tlsNetworkError(state: Pick<TlsNetworkState, 'action'>): string | null {
  return state.action.kind === 'failed' ? state.action.error : null;
}

function operatorHydrateKey(hostname: string, lanIp: string): string {
  return `${hostname}\0${lanIp}`;
}

export type TlsStartPhase = 'offer' | 'hostname' | 'lease';

export type TlsNetworkState = {
  startPhase: TlsStartPhase;
  nameMode: TlsNameMode;
  certificateMode: 'managed' | 'custom';
  customLabel: string;
  customDomain: string;
  ipv4Reserved: boolean;
  customPemStaged: boolean;
  operatorRequest: TlsOperatorRequest | null;
  /** Open Mailtext / DNS-Records once the operator must send or copy them. */
  revealOperatorRecords: boolean;
  action: TlsLocalAction;
  dnsChecks: TlsDnsCheck[] | null;
  localChecks: TlsLocalCheck[] | null;
};

const INITIAL: TlsNetworkState = {
  startPhase: 'offer',
  nameMode: 'generated',
  certificateMode: 'managed',
  customLabel: '',
  customDomain: '',
  ipv4Reserved: false,
  customPemStaged: false,
  operatorRequest: null,
  revealOperatorRecords: false,
  action: { kind: 'idle' },
  dnsChecks: null,
  localChecks: null,
};

export type TlsNetworkController = {
  getState(): TlsNetworkState;
  hydrateOperatorRequest(): Promise<void>;
  abandonSession(): void;
  setRevealOperatorRecords(open: boolean): void;
  startPrepare(): void;
  back(): void;
  patchDraft(
    patch: Partial<
      Pick<
        TlsNetworkState,
        'nameMode' | 'certificateMode' | 'customLabel' | 'customDomain' | 'ipv4Reserved'
      >
    >,
  ): void;
  advanceHostname(): void;
  submitLease(): Promise<void>;
  verifyDns(): Promise<void>;
  obtainOrCheck(): Promise<void>;
  apply(): Promise<void>;
  repair(): Promise<void>;
  reset(): Promise<void>;
  renew(): Promise<void>;
  stageCustomCertificate(): Promise<void>;
};

export function createTlsNetworkController(deps: {
  api: WartezimmerManagerApi;
  getConfig: () => HostStatus | null;
  lanIp: () => string | null;
  onAfterMutation: () => void | Promise<void>;
  onStateChange: () => void;
  requestConfirm: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
  /** True while LAN/proxy is writing the host (not snapshot loading). */
  isPeerMutating?: () => boolean;
}): TlsNetworkController {
  let state: TlsNetworkState = { ...INITIAL };
  let sessionGeneration = 0;
  let hydrateGeneration = 0;
  let hydrateInFlightKey: string | null = null;
  let lastHydrateKey: string | null = null;

  function emit(): void {
    deps.onStateChange();
  }

  function tls(): TlsStatus | undefined {
    return deps.getConfig()?.tls;
  }

  function set(patch: Partial<TlsNetworkState>): void {
    state = { ...state, ...patch };
    emit();
  }

  function hostLockedByPeer(): boolean {
    return hasBlockingMaintenanceOperation(deps.getConfig()) || Boolean(deps.isPeerMutating?.());
  }

  function lifecycleAllows(action: HostLifecycleAction): boolean {
    if (tlsNetworkLocksHost(state) && state.action.kind !== 'hydrating') return false;
    const lifecycle = deps.getConfig()?.lifecycle;
    if (!lifecycle) return true;
    const decision = evaluateHostLifecycleAction(lifecycle, action);
    if (!decision.allowed) {
      set({
        action: { kind: 'failed', error: decision.reason ?? 'Host-Aktion derzeit nicht erlaubt.' },
      });
      return false;
    }
    return true;
  }

  function beginHostMutation(): boolean {
    if (tlsNetworkLocksHost(state) || hostLockedByPeer()) {
      return false;
    }
    return true;
  }

  async function runAction(
    name: Extract<TlsLocalAction, { kind: 'running' }>['name'],
    action: () => Promise<Partial<TlsNetworkState>>,
  ): Promise<void> {
    if (!beginHostMutation()) return;
    const session = sessionGeneration;
    set({ action: { kind: 'running', name } });
    let outcome: Partial<TlsNetworkState>;
    try {
      outcome = { ...(await action()), action: { kind: 'idle' } };
    } catch (error) {
      outcome = {
        action: { kind: 'failed', error: error instanceof Error ? error.message : String(error) },
      };
    } finally {
      try {
        await deps.onAfterMutation();
      } catch {
        /* Preserve the action result; shell owns refresh errors. */
      }
    }
    // Leaving the view invalidates its result, not the in-flight mutation lock.
    set(session === sessionGeneration ? outcome : { action: { kind: 'idle' } });
  }

  async function runApply(): Promise<void> {
    if (!lifecycleAllows('tls-apply')) return;
    await runAction('apply', async () => {
      const result = await deps.api.applyHostTls();
      return { localChecks: result.checks ?? null };
    });
  }
  async function runReset(): Promise<void> {
    if (!lifecycleAllows('tls-reset')) return;
    await runAction('reset', async () => {
      await deps.api.resetHostTls();
      return { ...INITIAL };
    });
  }

  return {
    getState() {
      return state;
    },

    setRevealOperatorRecords(open) {
      set({ revealOperatorRecords: open });
    },

    abandonSession() {
      sessionGeneration += 1;
      hydrateGeneration += 1;
      hydrateInFlightKey = null;
      lastHydrateKey = null;
      if (state.action.kind !== 'running') set({ action: { kind: 'idle' } });
    },

    async hydrateOperatorRequest() {
      const current = tls();
      if (tlsOperatorRecordsAreTheTask(current)) {
        set({ revealOperatorRecords: true });
      }
      const lanIp = deps.lanIp()?.trim();
      if (
        !current ||
        current.mode !== 'managed' ||
        current.tokenConsumed ||
        !current.hostname ||
        !lanIp ||
        current.state === 'off'
      ) {
        return;
      }
      const key = operatorHydrateKey(current.hostname, lanIp);
      if (hydrateInFlightKey === key || lastHydrateKey === key) {
        return;
      }
      if (state.action.kind === 'running') {
        return;
      }
      if (hostLockedByPeer()) {
        return;
      }
      const generation = ++hydrateGeneration;
      const startedInSession = sessionGeneration;
      const identityChanged = lastHydrateKey !== null && lastHydrateKey !== key;
      hydrateInFlightKey = key;
      set({
        action: { kind: 'hydrating' },
        ...(identityChanged ? { operatorRequest: null, dnsChecks: null } : {}),
      });
      try {
        if (!lifecycleAllows('tls-prepare')) return;
        const result = await deps.api.prepareHostTls({
          mode: 'managed',
          hostname: current.installationDomain || current.hostname,
          lanIp,
        });
        if (generation !== hydrateGeneration || startedInSession !== sessionGeneration) {
          return;
        }
        const still = tls();
        const stillLan = deps.lanIp()?.trim() ?? '';
        if (
          still?.hostname !== current.hostname ||
          stillLan !== lanIp ||
          operatorHydrateKey(still.hostname ?? '', stillLan) !== key
        ) {
          return;
        }
        lastHydrateKey = key;
        if (result.operatorRequest) {
          set({ operatorRequest: result.operatorRequest, action: { kind: 'idle' } });
          return;
        }
        set({ action: { kind: 'idle' } });
      } catch {
        if (generation === hydrateGeneration) {
          set({ action: { kind: 'idle' } });
        }
      } finally {
        if (generation === hydrateGeneration) {
          hydrateInFlightKey = null;
          if (state.action.kind === 'hydrating') {
            set({ action: { kind: 'idle' } });
          }
        }
      }
    },

    startPrepare() {
      if (tlsNetworkLocksHost(state)) return;
      set({ startPhase: 'hostname', action: { kind: 'idle' } });
    },

    back() {
      if (tlsNetworkLocksHost(state)) return;
      if (state.startPhase === 'lease') {
        set({ startPhase: 'hostname', action: { kind: 'idle' } });
        return;
      }
      set({ startPhase: 'offer', action: { kind: 'idle' } });
    },

    patchDraft(patch) {
      if (tlsNetworkLocksHost(state)) return;
      set({ ...patch, action: { kind: 'idle' } });
    },

    advanceHostname() {
      if (tlsNetworkLocksHost(state)) return;
      if (!tlsNameValid(state)) {
        set({ action: { kind: 'failed', error: 'Bitte einen gültigen Namen wählen.' } });
        return;
      }
      set({ startPhase: 'lease', action: { kind: 'idle' } });
    },

    async submitLease() {
      if (tlsNetworkLocksHost(state)) return;
      const current = tls();
      const lanIp = deps.lanIp()?.trim();
      const network = deps.getConfig()?.network;
      if (tlsLeaseBlockedByStaleLan(network?.lanIpStale)) {
        set({ action: { kind: 'failed', error: TLS_LEASE_STALE_LAN_COPY } });
        return;
      }
      if (!state.ipv4Reserved) {
        set({
          action: {
            kind: 'failed',
            error: 'Bitte die feste IP oder DHCP-Reservierung bestätigen.',
          },
        });
        return;
      }
      if (!tlsNameValid(state)) {
        set({ action: { kind: 'failed', error: 'Bitte einen gültigen Namen wählen.' } });
        return;
      }
      if (!lanIp) {
        set({
          action: { kind: 'failed', error: 'Bitte zuerst die Adresse dieses Rechners speichern.' },
        });
        return;
      }
      if (current && current.state !== 'off') {
        set({ action: { kind: 'failed', error: 'HTTPS ist bereits vorbereitet.' } });
        return;
      }
      if (!beginHostMutation()) {
        return;
      }
      await runAction('prepare', async () => {
        const result = await deps.api.prepareHostTls({
          mode: tlsModeForNameMode(state.nameMode, state.certificateMode),
          hostname: tlsPrepareHostname(state),
          lanIp,
        });
        return {
          operatorRequest: result.operatorRequest,
          startPhase: 'offer',
          ipv4Reserved: true,
          revealOperatorRecords: true,
        };
      });
    },

    async verifyDns() {
      if (!lifecycleAllows('tls-verify')) return;
      await runAction('dns', async () => ({
        dnsChecks: (await deps.api.verifyHostTlsDns()).checks,
      }));
    },

    async obtainOrCheck() {
      if (!lifecycleAllows(tls()?.mode === 'custom' ? 'tls-check-certificate' : 'tls-obtain'))
        return;
      await runAction('obtain', async () => {
        const result =
          tls()?.mode === 'custom'
            ? await deps.api.checkHostTlsCertificate()
            : await deps.api.obtainHostTlsCertificate();
        return { localChecks: result.checks ?? null };
      });
    },

    apply() {
      return new Promise<void>((resolve, reject) => {
        if (!beginHostMutation()) {
          resolve();
          return;
        }
        const generation = sessionGeneration;
        deps.requestConfirm(
          TLS_CUTOVER_CONFIRM_MESSAGE,
          () => {
            if (generation !== sessionGeneration) {
              resolve();
              return;
            }
            void runApply().then(resolve, reject);
          },
          () => resolve(),
        );
      });
    },

    async repair() {
      if (!lifecycleAllows('tls-repair')) return;
      await runAction('repair', async () => ({
        localChecks: (await deps.api.repairHostTls()).checks ?? null,
      }));
    },

    reset() {
      return new Promise<void>((resolve, reject) => {
        if (!beginHostMutation()) {
          resolve();
          return;
        }
        const generation = sessionGeneration;
        deps.requestConfirm(
          TLS_RESET_CONFIRM_MESSAGE,
          () => {
            if (generation !== sessionGeneration) {
              resolve();
              return;
            }
            void runReset().then(resolve, reject);
          },
          () => resolve(),
        );
      });
    },

    async renew() {
      if (!lifecycleAllows('tls-renew')) return;
      await runAction('renew', async () => {
        if (tls()?.mode === 'custom') {
          const picked = await deps.api.renewHostTlsFromPem();
          return picked.canceled ? {} : { localChecks: picked.checks ?? null };
        }
        return { localChecks: (await deps.api.renewHostTls()).checks ?? null };
      });
    },

    async stageCustomCertificate() {
      if (!lifecycleAllows('tls-custom-certificate')) return;
      await runAction('stage', async () => {
        const picked = await deps.api.stageHostTlsCertificate();
        return picked.canceled ? {} : { customPemStaged: true, localChecks: picked.checks ?? null };
      });
    },
  };
}
