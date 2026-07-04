import {
  fetchDevicePairingStatus,
  startDevicePairing,
  type DevicePairingKind,
} from '$lib/auth/device-pairing-client';

export type DevicePairingMessages = {
  startError: string;
  statusError: string;
  expired: string;
};

export type DevicePairingUiState = {
  code: string | null;
  expiresAt: string | null;
  error: string | null;
};

export type CreateDevicePairingRuntimeOptions = {
  kind: DevicePairingKind;
  deviceId: string;
  messages: DevicePairingMessages;
  retryDelayMs?: number;
  isStopped: () => boolean;
  onState: (state: DevicePairingUiState) => void;
  onPaired: () => void | Promise<void>;
};

export type DevicePairingRuntime = {
  startPairing: () => Promise<void>;
  pollPairing: () => Promise<void>;
  clearPairing: () => void;
  isPairingActive: () => boolean;
  destroy: () => void;
};

export function createDevicePairingRuntime(
  options: CreateDevicePairingRuntimeOptions,
): DevicePairingRuntime {
  let pairingId: string | null = null;
  let startInFlight = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let code: string | null = null;
  let expiresAt: string | null = null;
  let error: string | null = null;

  const emit = () => {
    options.onState({ code, expiresAt, error });
  };

  const scheduleRetry = () => {
    if (retryTimer || options.isStopped()) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void startPairing();
    }, options.retryDelayMs ?? 5_000);
  };

  const clearPairing = () => {
    pairingId = null;
    code = null;
    expiresAt = null;
    emit();
  };

  const startPairing = async () => {
    if (pairingId || startInFlight || options.isStopped()) {
      return;
    }

    startInFlight = true;
    const result = await startDevicePairing(options.kind, options.deviceId);
    startInFlight = false;

    if (options.isStopped()) {
      return;
    }

    if (!result.ok) {
      pairingId = null;
      code = null;
      expiresAt = null;
      error = result.error.message || options.messages.startError;
      emit();
      scheduleRetry();
      return;
    }

    pairingId = result.data.pairingId;
    code = result.data.code;
    expiresAt = result.data.expiresAt;
    error = null;
    emit();
  };

  const pollPairing = async () => {
    if (!pairingId || options.isStopped()) {
      return;
    }

    const result = await fetchDevicePairingStatus(options.kind, pairingId);
    if (options.isStopped()) {
      return;
    }

    if (!result.ok) {
      pairingId = null;
      code = null;
      expiresAt = null;
      error = result.error.message || options.messages.statusError;
      emit();
      void startPairing();
      return;
    }

    if (result.data.status === 'expired') {
      pairingId = null;
      code = null;
      expiresAt = null;
      error = options.messages.expired;
      emit();
      void startPairing();
      return;
    }

    if (result.data.paired) {
      pairingId = null;
      code = null;
      expiresAt = null;
      error = null;
      emit();
      await options.onPaired();
    }
  };

  const destroy = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    pairingId = null;
    startInFlight = false;
  };

  return {
    startPairing,
    pollPairing,
    clearPairing,
    isPairingActive: () => pairingId != null || startInFlight,
    destroy,
  };
}
