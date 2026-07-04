import type { DatabaseSync } from 'node:sqlite';
import { TERMINAL_DEVICE_ID } from '../ops/device-ids.js';

/** Product default: pressed assist expires after 10 seconds. */
export const TERMINAL_ASSIST_PENDING_TIMEOUT_MS = 10_000;

export type TerminalAssistPendingRow = {
  deviceId: string;
  pressedAt: string;
  expiresAt: string;
};

export type TerminalAssistPendingItem = TerminalAssistPendingRow & {
  deviceLabel: string;
  remainingMs: number;
};

export function ensureTerminalAssistPendingSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS terminal_assist_pending (
      device_id TEXT PRIMARY KEY,
      pressed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
}

export function resolveTerminalDeviceLabel(deviceId: string): string {
  if (deviceId === TERMINAL_DEVICE_ID) {
    return 'Check-in Terminal';
  }
  return deviceId;
}

export function toAssistPendingItem(row: TerminalAssistPendingRow, nowMs = Date.now()): TerminalAssistPendingItem {
  const expiresMs = Date.parse(row.expiresAt);
  const remainingMs = Number.isNaN(expiresMs) ? 0 : Math.max(0, expiresMs - nowMs);
  return {
    ...row,
    deviceLabel: resolveTerminalDeviceLabel(row.deviceId),
    remainingMs,
  };
}

export function upsertTerminalAssistPending(
  db: DatabaseSync,
  deviceId: string,
  now = new Date(),
  timeoutMs = TERMINAL_ASSIST_PENDING_TIMEOUT_MS,
): TerminalAssistPendingRow {
  const pressedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + timeoutMs).toISOString();
  db.prepare(
    `INSERT INTO terminal_assist_pending (device_id, pressed_at, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       pressed_at = excluded.pressed_at,
       expires_at = excluded.expires_at`,
  ).run(deviceId, pressedAt, expiresAt);
  return { deviceId, pressedAt, expiresAt };
}

export function clearTerminalAssistPending(db: DatabaseSync, deviceId: string): boolean {
  const result = db.prepare('DELETE FROM terminal_assist_pending WHERE device_id = ?').run(deviceId);
  return result.changes > 0;
}

export function clearAllTerminalAssistPending(db: DatabaseSync): number {
  const result = db.prepare('DELETE FROM terminal_assist_pending').run();
  return result.changes;
}

export function getTerminalAssistPending(
  db: DatabaseSync,
  deviceId: string,
  nowMs = Date.now(),
): TerminalAssistPendingRow | null {
  const row = db
    .prepare(
      'SELECT device_id AS deviceId, pressed_at AS pressedAt, expires_at AS expiresAt FROM terminal_assist_pending WHERE device_id = ?',
    )
    .get(deviceId) as TerminalAssistPendingRow | undefined;
  if (!row) {
    return null;
  }
  if (Date.parse(row.expiresAt) <= nowMs) {
    clearTerminalAssistPending(db, deviceId);
    return null;
  }
  return row;
}

export function isTerminalAssistPendingActive(
  db: DatabaseSync,
  deviceId: string,
  nowMs = Date.now(),
): boolean {
  return getTerminalAssistPending(db, deviceId, nowMs) != null;
}

export function listActiveTerminalAssistPending(
  db: DatabaseSync,
  nowMs = Date.now(),
): TerminalAssistPendingRow[] {
  const rows = db
    .prepare(
      'SELECT device_id AS deviceId, pressed_at AS pressedAt, expires_at AS expiresAt FROM terminal_assist_pending ORDER BY pressed_at ASC',
    )
    .all() as TerminalAssistPendingRow[];

  const active: TerminalAssistPendingRow[] = [];
  for (const row of rows) {
    if (Date.parse(row.expiresAt) <= nowMs) {
      clearTerminalAssistPending(db, row.deviceId);
      continue;
    }
    active.push(row);
  }
  return active;
}

export function expireTerminalAssistPending(db: DatabaseSync, deviceId: string, nowMs = Date.now()): boolean {
  const row = db
    .prepare('SELECT expires_at AS expiresAt FROM terminal_assist_pending WHERE device_id = ?')
    .get(deviceId) as { expiresAt?: string } | undefined;
  if (!row?.expiresAt) {
    return false;
  }
  if (Date.parse(row.expiresAt) > nowMs) {
    return false;
  }
  return clearTerminalAssistPending(db, deviceId);
}
