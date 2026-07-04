import type { CoreDatabase } from '../db/database.js';
import { publishTvQueueUpdate } from '../queue/queue-stream-hub.js';

const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearAssistPendingExpiryTimer(deviceId: string): void {
  const timer = expiryTimers.get(deviceId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  expiryTimers.delete(deviceId);
}

export function cancelTerminalAssistPendingExpiry(deviceId: string): void {
  clearAssistPendingExpiryTimer(deviceId.trim());
}

export function clearAllTerminalAssistPendingExpiries(): void {
  for (const deviceId of expiryTimers.keys()) {
    clearAssistPendingExpiryTimer(deviceId);
  }
}

export function resetTerminalAssistPendingExpirySchedulerForTests(): void {
  clearAllTerminalAssistPendingExpiries();
}

function runAssistPendingExpiry(db: CoreDatabase, deviceId: string): void {
  clearAssistPendingExpiryTimer(deviceId);
  if (db.expireTerminalAssistPending(deviceId)) {
    publishTvQueueUpdate(db);
    return;
  }

  const pending = db.getTerminalAssistPending(deviceId);
  if (!pending) {
    return;
  }

  const expiresMs = Date.parse(pending.expiresAt);
  if (Number.isNaN(expiresMs)) {
    return;
  }

  if (expiresMs > Date.now()) {
    scheduleTerminalAssistPendingExpiry(db, deviceId, expiresMs);
    return;
  }

  const retryTimer = setTimeout(() => {
    runAssistPendingExpiry(db, deviceId);
  }, 250);
  retryTimer.unref();
  expiryTimers.set(deviceId, retryTimer);
}

export function scheduleTerminalAssistPendingExpiry(
  db: CoreDatabase,
  deviceId: string,
  expiresAtMs: number,
): void {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId || Number.isNaN(expiresAtMs)) {
    return;
  }

  clearAssistPendingExpiryTimer(normalizedDeviceId);
  const delayMs = Math.max(0, expiresAtMs - Date.now());
  const timer = setTimeout(() => {
    runAssistPendingExpiry(db, normalizedDeviceId);
  }, delayMs);
  timer.unref();
  expiryTimers.set(normalizedDeviceId, timer);
}

function syncPendingAssistTimers(db: CoreDatabase): void {
  const nowMs = Date.now();
  for (const row of db.listActiveTerminalAssistPending(nowMs)) {
    const expiresMs = Date.parse(row.expiresAt);
    if (Number.isNaN(expiresMs) || expiresMs <= nowMs) {
      continue;
    }
    if (!expiryTimers.has(row.deviceId)) {
      scheduleTerminalAssistPendingExpiry(db, row.deviceId, expiresMs);
    }
  }
}

export function resyncTerminalAssistPendingExpiryScheduler(db: CoreDatabase): void {
  clearAllTerminalAssistPendingExpiries();
  const nowMs = Date.now();
  for (const row of db.listActiveTerminalAssistPending(nowMs)) {
    const expiresMs = Date.parse(row.expiresAt);
    if (!Number.isNaN(expiresMs) && expiresMs > nowMs) {
      scheduleTerminalAssistPendingExpiry(db, row.deviceId, expiresMs);
    }
  }
  syncPendingAssistTimers(db);
}
