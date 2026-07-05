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
  assistPending: [] as NonNullable<QueueResponse['assistPending']>,
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
  if (item.identityRef?.trim()) {
    return;
  }

  const nextItems = [...queue.items];
  nextItems[index] = {
    ...item,
    identityRef: trimmed,
    hasMobilePhone: item.hasMobilePhone || true,
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
  mfaQueueDisplay.assistPending = [];
  mfaQueueDisplay.countdownNowMs = Date.now();
  lastQueueRevision = null;
}

export function applyMfaQueueSnapshot(data: MfaQueueStreamSnapshot) {
  if (lastQueueRevision !== null && data.revision < lastQueueRevision) {
    return;
  }

  const revisionAdvanced = lastQueueRevision === null || data.revision > lastQueueRevision;

  if (revisionAdvanced) {
    lastQueueRevision = data.revision;
    mfaQueueDisplay.queue = {
      view: 'mfa',
      revision: data.revision,
      items: data.items,
      assistPending: data.assistPending ?? [],
      checkinLocked: data.checkinLocked,
      serverTime: data.serverTime,
    };
    mfaQueueDisplay.assistPending = data.assistPending ?? [];
    mfaQueueDisplay.countdownNowMs = Date.now();
    mfaQueueDisplay.loading = false;
    mfaQueueDisplay.errorMessage = null;
    mfaQueueDisplay.backendUnreachable = false;
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

export function mountMfaQueueDisplay(): () => void {
  const disconnectQueueStream = connectMfaQueueStream({
    onSnapshot: applyMfaQueueSnapshot,
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
