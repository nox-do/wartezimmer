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
} from './tls-network-view-model.js';

export type TlsStartPhase = 'offer' | 'hostname' | 'lease';

export type TlsNetworkState = {
  startPhase: TlsStartPhase;
  nameMode: TlsNameMode;
  customLabel: string;
  customDomain: string;
  ipv4Reserved: boolean;
  customPemStaged: boolean;
  operatorRequest: TlsOperatorRequest | null;
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
  dnsChecks: null,
  localChecks: null,
  busy: false,
  error: null,
  copyNotice: null,
};

export type TlsNetworkController = {
  getState(): TlsNetworkState;
  hydrateOperatorRequest(): Promise<void>;
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
  requestConfirm: (message: string, onConfirm: () => void) => void;
}): TlsNetworkController {
  let state: TlsNetworkState = { ...INITIAL };

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

  function fail(error: unknown): void {
    set({
      busy: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  async function afterOk(extra: Partial<TlsNetworkState> = {}): Promise<void> {
    set({ busy: false, error: null, ...extra });
    await deps.onAfterMutation();
  }

  async function runApply(): Promise<void> {
    set({ busy: true, error: null });
    try {
      const result = await deps.api.applyHostTls();
      await afterOk({ localChecks: result.checks ?? state.localChecks });
    } catch (error) {
      fail(error);
    }
  }

  async function runReset(): Promise<void> {
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

    async hydrateOperatorRequest() {
      const current = tls();
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
      try {
        const result = await deps.api.prepareHostTls({
          mode: 'managed',
          hostname: current.hostname,
          lanIp,
        });
        if (result.operatorRequest) {
          set({ operatorRequest: result.operatorRequest });
        }
      } catch {
        /* Mail replay stays without token if Setup refuses identity replay. */
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
        });
      } catch (error) {
        fail(error);
      }
    },

    async verifyDns() {
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
      set({ busy: true, error: null });
      try {
        const result =
          tls()?.mode === 'custom'
            ? await deps.api.checkHostTlsCertificate()
            : await deps.api.obtainHostTlsCertificate();
        set({
          busy: false,
          error: null,
          localChecks: result.checks ?? null,
        });
        await deps.onAfterMutation();
      } catch (error) {
        fail(error);
      }
    },

    apply() {
      return new Promise<void>((resolve, reject) => {
        deps.requestConfirm(TLS_CUTOVER_CONFIRM_MESSAGE, () => {
          void runApply().then(resolve, reject);
        });
      });
    },

    async repair() {
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
        deps.requestConfirm(TLS_RESET_CONFIRM_MESSAGE, () => {
          void runReset().then(resolve, reject);
        });
      });
    },

    async renew() {
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
