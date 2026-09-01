import { createDevicePairingRuntime } from '$lib/auth/device-pairing-runtime';
import { WAITING_ROOM_DEVICE_ID } from '$lib/ops/device-presence-api';
import { SSE_CLIENT_ERROR } from '$lib/api/sse-client';
import { t } from '$lib/i18n/i18nStore.svelte';
import {
  callTicketCodes,
  findNewCallTickets,
  isCallAudioUnlocked,
  mountCallAudioPriming,
  playCallChime,
  primeCallAudio,
} from '$lib/tv/call-chime';
import {
  partitionTvQueue,
  type TvCallRow,
  type TvQueueResponse,
  type TvWaitingRow,
} from '$lib/tv/tv-queue';
import { connectTvQueueStream } from '$lib/tv/tv-stream';

export const tvDisplay = $state({
  loading: true,
  errorMessage: null as string | null,
  waiting: [] as TvWaitingRow[],
  calls: [] as TvCallRow[],
  pairingCode: null as string | null,
  pairingExpiresAt: null as string | null,
});

let knownCallTickets = $state<Set<string>>(new Set());
let callsInitialized = $state(false);

function resetTvDisplaySession() {
  tvDisplay.loading = true;
  tvDisplay.errorMessage = null;
  tvDisplay.waiting = [];
  tvDisplay.calls = [];
  tvDisplay.pairingCode = null;
  tvDisplay.pairingExpiresAt = null;
  knownCallTickets = new Set();
  callsInitialized = false;
}

function applyQueueSnapshot(data: TvQueueResponse) {
  tvDisplay.loading = false;
  tvDisplay.errorMessage = null;

  if (!isCallAudioUnlocked()) {
    void primeCallAudio();
  }

  const partitioned = partitionTvQueue(data.items);
  const nextCalls = partitioned.calls;
  const nextCallTickets = callTicketCodes(nextCalls);

  if (callsInitialized) {
    const newTickets = findNewCallTickets(knownCallTickets, nextCallTickets);
    if (newTickets.length > 0) {
      playCallChime();
    }
  } else {
    callsInitialized = true;
  }

  knownCallTickets = new Set(nextCallTickets);
  tvDisplay.waiting = partitioned.waiting;
  tvDisplay.calls = nextCalls;
}

function startQueueSession(options: { onConnectFailed?: () => void } = {}): () => void {
  tvDisplay.loading = true;
  tvDisplay.errorMessage = null;
  tvDisplay.pairingCode = null;
  tvDisplay.pairingExpiresAt = null;
  const stopAudioPriming = mountCallAudioPriming();

  const disconnectStream = connectTvQueueStream({
    onSnapshot: applyQueueSnapshot,
    onError: (message) => {
      if (message === SSE_CLIENT_ERROR.unauthorized) {
        options.onConnectFailed?.();
      }
      tvDisplay.errorMessage = message;
    },
  });

  return () => {
    disconnectStream();
    stopAudioPriming();
  };
}

export function mountTvDisplay(): () => void {
  resetTvDisplaySession();

  let stopped = false;
  let sessionCleanup: (() => void) | null = null;

  const pairing = createDevicePairingRuntime({
    kind: 'tv',
    deviceId: WAITING_ROOM_DEVICE_ID,
    messages: {
      startError: t('tv.pairingStartError'),
      statusError: t('tv.pairingStatusError'),
      expired: t('tv.pairingExpired'),
    },
    isStopped: () => stopped,
    onState: (state) => {
      tvDisplay.pairingCode = state.code;
      tvDisplay.pairingExpiresAt = state.expiresAt;
      if (state.error) {
        tvDisplay.errorMessage = state.error;
      }
    },
    onPaired: () => {
      connectQueueSession();
    },
  });

  function connectQueueSession() {
    sessionCleanup?.();
    pairing.clearPairing();
    sessionCleanup = startQueueSession({
      onConnectFailed: () => {
        sessionCleanup?.();
        sessionCleanup = null;
        tvDisplay.loading = false;
        void pairing.startPairing();
      },
    });
  }

  connectQueueSession();

  const pollTimer = setInterval(() => {
    if (pairing.isPairingActive()) {
      void pairing.pollPairing();
    }
  }, 1_000);

  return () => {
    stopped = true;
    sessionCleanup?.();
    pairing.destroy();
    clearInterval(pollTimer);
    resetTvDisplaySession();
  };
}
