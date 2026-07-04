import type { CoreDatabase } from '../db/database.js';
import {
  publishExpiredRecallWindowForTicket,
  publishExpiredRecallWindows,
} from './queue-stream-hub.js';

const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearRecallWindowExpiryTimer(ticketId: string): void {
  const timer = expiryTimers.get(ticketId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  expiryTimers.delete(ticketId);
}

export function cancelRecallWindowExpiry(ticketId: string): void {
  clearRecallWindowExpiryTimer(ticketId.trim());
}

export function clearAllRecallWindowExpiries(): void {
  for (const ticketId of expiryTimers.keys()) {
    clearRecallWindowExpiryTimer(ticketId);
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

function runRecallWindowExpiry(db: CoreDatabase, ticketId: string): void {
  const nowMs = Date.now();
  clearRecallWindowExpiryTimer(ticketId);
  if (publishExpiredRecallWindowForTicket(db, ticketId)) {
    return;
  }

  const item = db.listQueue().find((entry) => entry.id === ticketId);
  if (item?.status !== 'absent_return_later' || !item.returnUntil?.trim()) {
    return;
  }

  const returnUntilMs = Date.parse(item.returnUntil);
  if (Number.isNaN(returnUntilMs)) {
    return;
  }

  if (returnUntilMs > nowMs) {
    scheduleRecallWindowExpiry(db, ticketId, returnUntilMs);
    return;
  }

  const retryTimer = setTimeout(() => {
    runRecallWindowExpiry(db, ticketId);
  }, 1_000);
  retryTimer.unref();
  expiryTimers.set(ticketId, retryTimer);
}

export function scheduleRecallWindowExpiry(
  db: CoreDatabase,
  ticketId: string,
  returnUntilMs: number,
): void {
  const normalizedTicketId = ticketId.trim();
  if (!normalizedTicketId || Number.isNaN(returnUntilMs)) {
    return;
  }

  clearRecallWindowExpiryTimer(normalizedTicketId);
  const delayMs = Math.max(0, returnUntilMs - Date.now());
  const timer = setTimeout(() => {
    runRecallWindowExpiry(db, normalizedTicketId);
  }, delayMs);
  timer.unref();
  expiryTimers.set(normalizedTicketId, timer);
}

export function resyncRecallWindowExpiryScheduler(db: CoreDatabase): void {
  clearAllRecallWindowExpiries();
  publishExpiredRecallWindows(db);
  syncPendingRecallWindowTimers(db);
}
