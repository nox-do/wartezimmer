import { DEFAULT_TERMINAL_PATIENT_LOCALES } from '@wartezimmer/domain';
import {
  createDevicePairingRuntime,
  type DevicePairingMessages,
} from '$lib/auth/device-pairing-runtime';
import { TERMINAL_DEVICE_ID } from '$lib/ops/device-presence-api';
import { fetchTerminalHeartbeat } from '$lib/terminal/terminal-api';
import {
  connectTerminalDeviceStream,
  SSE_CLIENT_ERROR,
} from '$lib/terminal/terminal-device-stream';
import type { TerminalOpsSnapshot } from '$lib/terminal/terminal-ops-context';

export const HEARTBEAT_POLL_MS = 1_000;

function createInitialOps(): TerminalOpsSnapshot {
  return {
    loading: true,
    deviceAuthorized: false,
    checkinLocked: false,
    emergencyEnabled: false,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: false,
    terminalAuthNameDobEnabled: false,
    terminalAuthEgkEnabled: false,
    terminalPatientLocales: [...DEFAULT_TERMINAL_PATIENT_LOCALES],
    emergencyActive: false,
  };
}

function createInitialPairingUi() {
  return {
    code: null as string | null,
    expiresAt: null as string | null,
    error: null as string | null,
  };
}

export const terminalOps = $state<TerminalOpsSnapshot>(createInitialOps());

export const terminalPairingUi = $state(createInitialPairingUi());

function resetTerminalOpsState(): void {
  Object.assign(terminalOps, createInitialOps());
  Object.assign(terminalPairingUi, createInitialPairingUi());
}

export type MountTerminalOpsRuntimeOptions = {
  pairingMessages: DevicePairingMessages;
};

type RuntimeRefresh = () => Promise<boolean>;

let activeRefresh: RuntimeRefresh | null = null;

/** Heartbeat refresh while terminal layout is mounted; no-op if unmounted. */
export async function refreshTerminalOpsHeartbeat(): Promise<boolean> {
  if (!activeRefresh) {
    return false;
  }
  return activeRefresh();
}

/**
 * Pairing + Heartbeat-Poll + Device-SSE. Call from terminal layout `onMount`.
 * Resets module state on mount and unmount so remounts never flash stale auth.
 */
export function mountTerminalOpsRuntime(options: MountTerminalOpsRuntimeOptions): () => void {
  resetTerminalOpsState();

  let stopped = false;
  let deviceStreamCleanup: (() => void) | null = null;

  const pairing = createDevicePairingRuntime({
    kind: 'terminal',
    deviceId: TERMINAL_DEVICE_ID,
    messages: options.pairingMessages,
    isStopped: () => stopped,
    onState: (state) => {
      terminalPairingUi.code = state.code;
      terminalPairingUi.expiresAt = state.expiresAt;
      terminalPairingUi.error = state.error;
    },
    onPaired: async () => {
      terminalOps.deviceAuthorized = true;
      ensureDeviceStream();
      await refresh();
    },
  });

  function stopDeviceStream() {
    deviceStreamCleanup?.();
    deviceStreamCleanup = null;
  }

  function resetDeviceAuthorization() {
    stopDeviceStream();
    terminalOps.deviceAuthorized = false;
    pairing.clearPairing();
  }

  function ensureDeviceStream() {
    if (deviceStreamCleanup) {
      return;
    }
    startDeviceStream();
  }

  function startDeviceStream() {
    stopDeviceStream();
    deviceStreamCleanup = connectTerminalDeviceStream({
      onError: (message) => {
        if (message === SSE_CLIENT_ERROR.unauthorized) {
          resetDeviceAuthorization();
          void pairing.startPairing();
        }
      },
    });
  }

  async function refresh(): Promise<boolean> {
    const result = await fetchTerminalHeartbeat();
    if (stopped) {
      return false;
    }
    if (!result.ok) {
      terminalOps.loading = false;
      if (result.error.status === 401) {
        resetDeviceAuthorization();
        void pairing.startPairing();
        return false;
      }
      terminalPairingUi.error = result.error.message;
      return true;
    }

    terminalOps.loading = false;
    terminalOps.deviceAuthorized = true;
    terminalPairingUi.error = null;
    ensureDeviceStream();
    terminalOps.checkinLocked = result.data.checkinLocked;
    terminalOps.emergencyEnabled = result.data.emergencyEnabled;
    terminalOps.terminalWlanPromoEnabled = result.data.terminalWlanPromoEnabled;
    terminalOps.terminalAuthPhoneEnabled = result.data.terminalAuthPhoneEnabled;
    terminalOps.terminalAuthNameDobEnabled = result.data.terminalAuthNameDobEnabled;
    terminalOps.terminalAuthEgkEnabled = result.data.terminalAuthEgkEnabled;
    terminalOps.terminalPatientLocales = result.data.terminalPatientLocales;
    terminalOps.emergencyActive = result.data.emergencyActive;
    return true;
  }

  activeRefresh = refresh;

  void refresh().then((authorized) => {
    if (!authorized) {
      void pairing.startPairing();
    }
  });

  const timer = setInterval(() => {
    if (terminalOps.deviceAuthorized) {
      void refresh().then((authorized) => {
        if (!authorized) {
          void pairing.startPairing();
        }
      });
    } else if (pairing.isPairingActive()) {
      void pairing.pollPairing();
    } else {
      void pairing.startPairing();
    }
  }, HEARTBEAT_POLL_MS);

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void refresh().then((authorized) => {
        if (!authorized) {
          void pairing.startPairing();
        }
      });
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    activeRefresh = null;
    stopDeviceStream();
    pairing.destroy();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    resetTerminalOpsState();
  };
}
