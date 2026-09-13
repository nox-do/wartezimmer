import type {
  HostStatus,
  TlsDnsCheck,
  TlsLocalCheck,
  TlsOperatorRequest,
  TlsStatus,
} from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
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

export function tlsNetworkLocksHost(state: Pick<TlsNetworkState, 'busy' | 'hydrating'>): boolean {
  return state.busy || state.hydrating;
}

function operatorHydrateKey(hostname: string, lanIp: string): string {
  return `${hostname}\0${lanIp}`;
}

export type TlsStartPhase = 'offer' | 'hostname' | 'lease';

export type TlsNetworkState = {
  startPhase: TlsStartPhase;
  nameMode: TlsNameMode;
  customLabel: string;
  customDomain: string;
  ipv4Reserved: boolean;
  customPemStaged: boolean;
  operatorRequest: TlsOperatorRequest | null;
  /** Open Mailtext / DNS-Records once the operator must send or copy them. */
  revealOperatorRecords: boolean;
  /** True while obtain/check-certificate is in flight (UI wait before status refresh). */
  pendingObtain: boolean;
  hydrating: boolean;
  dnsChecks: TlsDnsCheck[] | null;
  localChecks: TlsLocalCheck[] | null;
  busy: boolean;
  error: string | null;
  copyNotice: string | null;
};

const INITIAL: TlsNetworkState = {
  startPhase: 'offer',
  nameMode: 'generated',
  customLabel: '',
  customDomain: '',
  ipv4Reserved: false,
  customPemStaged: false,
  operatorRequest: null,
  revealOperatorRecords: false,
  pendingObtain: false,
  hydrating: false,
  dnsChecks: null,
  localChecks: null,
  busy: false,
  error: null,
  copyNotice: null,
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
      Pick<TlsNetworkState, 'nameMode' | 'customLabel' | 'customDomain' | 'ipv4Reserved'>
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
  api: PraxisManagerApi;
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
    return Boolean(deps.isPeerMutating?.());
  }

  function beginHostMutation(): boolean {
    if (state.busy || state.hydrating || hostLockedByPeer()) {
      return false;
    }
    return true;
  }

  function fail(error: unknown): void {
    set({
      busy: false,
      pendingObtain: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /** Apply / obtain / prepare persistieren `lastError` oft trotz geworfener API-Exception. */
  async function failThenRefreshHost(error: unknown): Promise<void> {
    fail(error);
    try {
      await deps.onAfterMutation();
    } catch {
      /* Keep the mutation error; a later poll can still catch up. */
    }
  }

  async function afterOk(extra: Partial<TlsNetworkState> = {}): Promise<void> {
    set({ busy: false, error: null, ...extra });
    await deps.onAfterMutation();
  }

  async function runApply(): Promise<void> {
    if (!beginHostMutation()) {
      return;
    }
    set({ busy: true, error: null });
    try {
      const result = await deps.api.applyHostTls();
      await afterOk({ localChecks: result.checks ?? state.localChecks });
    } catch (error) {
      await failThenRefreshHost(error);
    }
  }

  async function runReset(): Promise<void> {
    if (!beginHostMutation()) {
      return;
    }
    set({ busy: true, error: null });
    try {
      await deps.api.resetHostTls();
      state = { ...INITIAL };
      emit();
      await deps.onAfterMutation();
    } catch (error) {
      fail(error);
    }
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
      if (state.hydrating) {
        set({ hydrating: false });
      }
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
      if (state.busy) {
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
        hydrating: true,
        ...(identityChanged ? { operatorRequest: null, dnsChecks: null } : {}),
      });
      try {
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
          set({ operatorRequest: result.operatorRequest, hydrating: false });
          return;
        }
        set({ hydrating: false });
      } catch {
        if (generation === hydrateGeneration) {
          set({ hydrating: false });
        }
      } finally {
        if (generation === hydrateGeneration) {
          hydrateInFlightKey = null;
          if (state.hydrating) {
            set({ hydrating: false });
          }
        }
      }
    },

    startPrepare() {
      set({ startPhase: 'hostname', error: null, copyNotice: null });
    },

    back() {
      if (state.startPhase === 'lease') {
        set({ startPhase: 'hostname', error: null });
        return;
      }
      set({ startPhase: 'offer', error: null });
    },

    patchDraft(patch) {
      set({ ...patch, error: null, copyNotice: null });
    },

    advanceHostname() {
      if (!tlsNameValid(state)) {
        set({ error: 'Bitte einen gültigen Namen wählen.' });
        return;
      }
      set({ startPhase: 'lease', error: null });
    },

    async submitLease() {
      const current = tls();
      const lanIp = deps.lanIp()?.trim();
      const network = deps.getConfig()?.network;
      if (tlsLeaseBlockedByStaleLan(network?.lanIpStale)) {
        set({ error: TLS_LEASE_STALE_LAN_COPY });
        return;
      }
      if (!state.ipv4Reserved) {
        set({ error: 'Bitte die feste IP oder DHCP-Reservierung bestätigen.' });
        return;
      }
      if (!tlsNameValid(state)) {
        set({ error: 'Bitte einen gültigen Namen wählen.' });
        return;
      }
      if (!lanIp) {
        set({ error: 'Bitte zuerst die Adresse dieses Rechners speichern.' });
        return;
      }
      if (current && current.state !== 'off') {
        set({ error: 'HTTPS ist bereits vorbereitet.' });
        return;
      }
      if (!beginHostMutation()) {
        return;
      }
      set({ busy: true, error: null });
      try {
        const result = await deps.api.prepareHostTls({
          mode: tlsModeForNameMode(state.nameMode),
          hostname: tlsPrepareHostname(state),
          lanIp,
        });
        await afterOk({
          operatorRequest: result.operatorRequest,
          startPhase: 'offer',
          ipv4Reserved: true,
          revealOperatorRecords: true,
        });
      } catch (error) {
        await failThenRefreshHost(error);
      }
    },

    async verifyDns() {
      if (!beginHostMutation()) {
        return;
      }
      set({ busy: true, error: null });
      try {
        const result = await deps.api.verifyHostTlsDns();
        set({
          busy: false,
          error: null,
          dnsChecks: result.checks,
        });
        await deps.onAfterMutation();
      } catch (error) {
        fail(error);
      }
    },

    async obtainOrCheck() {
      if (!beginHostMutation()) {
        return;
      }
      set({ busy: true, pendingObtain: true, error: null });
      try {
        const result =
          tls()?.mode === 'custom'
            ? await deps.api.checkHostTlsCertificate()
            : await deps.api.obtainHostTlsCertificate();
        set({
          busy: false,
          pendingObtain: false,
          error: null,
          localChecks: result.checks ?? null,
        });
        await deps.onAfterMutation();
      } catch (error) {
        await failThenRefreshHost(error);
      }
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
      if (!beginHostMutation()) {
        return;
      }
      set({ busy: true, error: null });
      try {
        const result = await deps.api.repairHostTls();
        await afterOk({ localChecks: result.checks ?? null });
      } catch (error) {
        fail(error);
      }
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
      if (!beginHostMutation()) {
        return;
      }
      set({ busy: true, error: null });
      try {
        if (tls()?.mode === 'custom') {
          const picked = await deps.api.renewHostTlsFromPem();
          if (picked.canceled) {
            set({ busy: false });
            return;
          }
          await afterOk({ localChecks: picked.checks ?? null });
          return;
        }
        const result = await deps.api.renewHostTls();
        await afterOk({ localChecks: result.checks ?? null });
      } catch (error) {
        fail(error);
      }
    },

    async stageCustomCertificate() {
      if (!beginHostMutation()) {
        return;
      }
      set({ busy: true, error: null });
      try {
        const picked = await deps.api.stageHostTlsCertificate();
        if (picked.canceled) {
          set({ busy: false });
          return;
        }
        await afterOk({ customPemStaged: true, localChecks: picked.checks ?? null });
      } catch (error) {
        fail(error);
      }
    },
  };
}
