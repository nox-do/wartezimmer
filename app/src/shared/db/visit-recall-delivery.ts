import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { MessageDispatchResult } from '../messaging/sms-sender.js';

export type RecallDeliveryStatus =
  | 'sending'
  | 'accepted'
  | 'delivered'
  | 'failed'
  | 'unknown'
  | 'simulated';
export type RecallDelivery = {
  visitId: string;
  token: string;
  returnUntil: string;
  phone: string;
  provider: string;
  messageId: string | null;
  status: RecallDeliveryStatus;
};

export function ensureRecallDeliverySchema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS visit_recall_delivery (
    visit_id TEXT PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
    token TEXT NOT NULL, return_until TEXT NOT NULL, phone TEXT NOT NULL,
    provider TEXT NOT NULL, message_id TEXT, status TEXT NOT NULL
  )`);
}

export function listRecallDeliveries(db: DatabaseSync): RecallDelivery[] {
  return db
    .prepare(
      `SELECT d.visit_id AS visitId, d.token, d.return_until AS returnUntil,
    d.phone, d.provider, d.message_id AS messageId, d.status
    FROM visit_recall_delivery d JOIN visit_host_state h ON h.visit_id = d.visit_id
    WHERE h.absent_mode = 'return_later' AND h.return_until = d.return_until`,
    )
    .all() as RecallDelivery[];
}

/** Called inside the caller's write transaction; a failed attempt is the only retryable state. */
export function beginRecallDelivery(
  db: DatabaseSync,
  visitId: string,
  returnUntil: string,
  phone: string,
): string | null {
  const token = randomUUID();
  const result = db
    .prepare(
      `INSERT INTO visit_recall_delivery
    (visit_id, token, return_until, phone, provider, message_id, status)
    VALUES (?, ?, ?, ?, 'none', NULL, 'sending')
    ON CONFLICT(visit_id) DO UPDATE SET token = excluded.token,
      return_until = excluded.return_until, phone = excluded.phone,
      provider = 'none', message_id = NULL, status = 'sending'
    WHERE visit_recall_delivery.return_until != excluded.return_until
      OR visit_recall_delivery.status = 'failed'`,
    )
    .run(visitId, token, returnUntil, phone);
  return result.changes ? token : null;
}

export function finishRecallDelivery(
  db: DatabaseSync,
  visitId: string,
  token: string,
  result: MessageDispatchResult,
  status: RecallDeliveryStatus = result.status ?? (result.sent ? 'accepted' : 'failed'),
): boolean {
  return Boolean(
    db
      .prepare(
        `UPDATE visit_recall_delivery SET provider = ?, message_id = ?, status = ?
    WHERE visit_id = ? AND token = ? AND EXISTS (
      SELECT 1 FROM visit_host_state h WHERE h.visit_id = visit_recall_delivery.visit_id
      AND h.absent_mode = 'return_later' AND h.return_until = visit_recall_delivery.return_until
    )`,
      )
      .run(result.provider, result.messageId ?? null, status, visitId, token).changes,
  );
}
