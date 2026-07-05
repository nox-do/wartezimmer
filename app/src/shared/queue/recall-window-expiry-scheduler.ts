import type { CoreDatabase } from '../db/database.js';
import {
  publishExpiredRecallWindowForVisit,
  publishExpiredRecallWindows,
} from './queue-stream-hub.js';

const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearRecallWindowExpiryTimer(visitId: string): void {
  const timer = expiryTimers.get(visitId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  expiryTimers.delete(visitId);
}

export function cancelRecallWindowExpiry(visitId: string): void {
  clearRecallWindowExpiryTimer(visitId.trim());
}

export function clearAllRecallWindowExpiries(): void {
  for (const visitId of expiryTimers.keys()) {
    clearRecallWindowExpiryTimer(visitId);
  }
}

export function resetRecallWindowExpirySchedulerForTests(): void {
  clearAllRecallWindowExpiries();
}

function syncPendingRecallWindowTimers(db: CoreDatabase): void {
  const nowMs = Date.now();
  for (const item of db.listQueue()) {
    if (item.status !== 'absent_return_later' || !item.returnUntil?.trim()) {
      continue;
    }
    const returnUntilMs = Date.parse(item.returnUntil);
    if (Number.isNaN(returnUntilMs) || returnUntilMs <= nowMs) {
      continue;
    }
    if (!expiryTimers.has(item.id)) {
      scheduleRecallWindowExpiry(db, item.id, returnUntilMs);
    }
  }
}

function runRecallWindowExpiry(db: CoreDatabase, visitId: string): void {
  const nowMs = Date.now();
  clearRecallWindowExpiryTimer(visitId);
  if (publishExpiredRecallWindowForVisit(db, visitId)) {
    return;
  }

  const item = db.listQueue().find((entry) => entry.id === visitId);
  if (item?.status !== 'absent_return_later' || !item.returnUntil?.trim()) {
    return;
  }

  const returnUntilMs = Date.parse(item.returnUntil);
  if (Number.isNaN(returnUntilMs)) {
    return;
  }

  if (returnUntilMs > nowMs) {
    scheduleRecallWindowExpiry(db, visitId, returnUntilMs);
    return;
  }

  const retryTimer = setTimeout(() => {
    runRecallWindowExpiry(db, visitId);
  }, 1_000);
  retryTimer.unref();
  expiryTimers.set(visitId, retryTimer);
}

export function scheduleRecallWindowExpiry(
  db: CoreDatabase,
  visitId: string,
  returnUntilMs: number,
): void {
  const normalizedVisitId = visitId.trim();
  if (!normalizedVisitId || Number.isNaN(returnUntilMs)) {
    return;
  }

  clearRecallWindowExpiryTimer(normalizedVisitId);
  const delayMs = Math.max(0, returnUntilMs - Date.now());
  const timer = setTimeout(() => {
    runRecallWindowExpiry(db, normalizedVisitId);
  }, delayMs);
  timer.unref();
  expiryTimers.set(normalizedVisitId, timer);
}

export function resyncRecallWindowExpiryScheduler(db: CoreDatabase): void {
  clearAllRecallWindowExpiries();
  publishExpiredRecallWindows(db);
  syncPendingRecallWindowTimers(db);
}
