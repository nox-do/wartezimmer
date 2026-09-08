import { connectMfaQueueStream, type MfaQueueStreamSnapshot } from '$lib/mfa/queue-stream';
import { formatClockTime } from '$lib/queue/format-time';
import { partitionQueueItems } from '$lib/queue/queue-zones';
import type { QueueResponse } from '$lib/queue/types';
import { tf } from '$lib/i18n/i18nStore.svelte';

export const mfaQueueDisplay = $state({
  loading: true,
  errorMessage: null as string | null,
  backendUnreachable: false,
  queue: null as QueueResponse | null,
  countdownNowMs: Date.now(),
});

let lastQueueRevision = $state<number | null>(null);

export function applyMfaQueueIdentityRef(visitId: string, identityRef: string): void {
  const queue = mfaQueueDisplay.queue;
  if (!queue) {
    return;
  }

  const trimmed = identityRef.trim();
  if (!trimmed) {
    return;
  }

  const index = queue.items.findIndex((item) => item.visitId === visitId);
  if (index < 0) {
    return;
  }

  const item = queue.items[index];
  if (item.identityRefEditable !== true) {
    return;
  }

  const nextItems = [...queue.items];
  nextItems[index] = {
    ...item,
    identityRef: trimmed,
    identityRefEditable: true,
  };
  mfaQueueDisplay.queue = {
    ...queue,
    items: nextItems,
  };
}

export function applyMfaQueueTriageLevel(
  visitId: string,
  triageLevel: 'red' | 'yellow' | 'green' | null,
): void {
  const queue = mfaQueueDisplay.queue;
  if (!queue) {
    return;
  }

  const index = queue.items.findIndex((item) => item.visitId === visitId);
  if (index < 0) {
    return;
  }

  const nextItems = [...queue.items];
  nextItems[index] = {
    ...nextItems[index],
    triageLevel,
  };
  mfaQueueDisplay.queue = {
    ...queue,
    items: nextItems,
  };
}

export function resetMfaQueueDisplay() {
  mfaQueueDisplay.loading = true;
  mfaQueueDisplay.errorMessage = null;
  mfaQueueDisplay.backendUnreachable = false;
  mfaQueueDisplay.queue = null;
  mfaQueueDisplay.countdownNowMs = Date.now();
  lastQueueRevision = null;
}

export type MfaQueueDisplayHandlers = {
  onBackendRecovered?: () => void;
};

export function applyMfaQueueSnapshot(
  data: MfaQueueStreamSnapshot,
  handlers: MfaQueueDisplayHandlers = {},
) {
  if (lastQueueRevision !== null && data.revision < lastQueueRevision) {
    return;
  }

  const wasUnreachable = mfaQueueDisplay.backendUnreachable;
  const revisionAdvanced = lastQueueRevision === null || data.revision > lastQueueRevision;

  mfaQueueDisplay.loading = false;
  mfaQueueDisplay.errorMessage = null;
  mfaQueueDisplay.backendUnreachable = false;
  if (wasUnreachable) {
    handlers.onBackendRecovered?.();
  }

  if (revisionAdvanced) {
    lastQueueRevision = data.revision;
    mfaQueueDisplay.queue = {
      view: 'mfa',
      revision: data.revision,
      items: data.items,
      checkinLocked: data.checkinLocked,
      serverTime: data.serverTime,
    };
    mfaQueueDisplay.countdownNowMs = Date.now();
    return;
  }

  if (
    mfaQueueDisplay.queue &&
    (data.checkinLocked !== mfaQueueDisplay.queue.checkinLocked ||
      data.serverTime !== mfaQueueDisplay.queue.serverTime)
  ) {
    mfaQueueDisplay.queue = {
      ...mfaQueueDisplay.queue,
      checkinLocked: data.checkinLocked,
      serverTime: data.serverTime,
    };
  }
}

export function getMfaZones() {
  return mfaQueueDisplay.queue
    ? partitionQueueItems(mfaQueueDisplay.queue.items)
    : { active: [], away: [], waiting: [] };
}

export function getMfaClockLabel() {
  return mfaQueueDisplay.queue
    ? tf('mfa.clockNow', { time: formatClockTime(mfaQueueDisplay.queue.serverTime) })
    : '';
}

export function mountMfaQueueDisplay(handlers: MfaQueueDisplayHandlers = {}): () => void {
  const disconnectQueueStream = connectMfaQueueStream({
    onSnapshot: (data) => applyMfaQueueSnapshot(data, handlers),
    onError: (error) => {
      mfaQueueDisplay.errorMessage = error.message;
      mfaQueueDisplay.backendUnreachable = error.backendUnreachable;
      mfaQueueDisplay.loading = false;
    },
  });

  const stopCountdownTick = setInterval(() => {
    mfaQueueDisplay.countdownNowMs = Date.now();
  }, 1000);

  return () => {
    disconnectQueueStream();
    clearInterval(stopCountdownTick);
  };
}
