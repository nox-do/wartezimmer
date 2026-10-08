import type { DatabaseSync } from 'node:sqlite';

export function ensureVisitRecallConsentSchema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS visit_recall_consent (
    visit_id TEXT PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    confirmed_at TEXT NOT NULL,
    actor_id TEXT,
    wording_version TEXT NOT NULL
  )`);
}

export function recordVisitRecallConsent(
  db: DatabaseSync,
  visitId: string,
  phone: string,
  confirmedAt: string,
  actorId?: string,
): void {
  db.prepare(
    `INSERT INTO visit_recall_consent
    (visit_id, phone, confirmed_at, actor_id, wording_version) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(visit_id) DO UPDATE SET phone = excluded.phone,
    confirmed_at = excluded.confirmed_at, actor_id = excluded.actor_id,
    wording_version = excluded.wording_version`,
  ).run(visitId, phone, confirmedAt, actorId ?? null, 'mfa-oral-recall-v1');
}

export function clearVisitRecallConsent(db: DatabaseSync, visitId: string): void {
  db.prepare('DELETE FROM visit_recall_consent WHERE visit_id = ?').run(visitId);
}

export function hasVisitRecallConsent(db: DatabaseSync, visitId: string, phone: string): boolean {
  return Boolean(
    db
      .prepare('SELECT 1 FROM visit_recall_consent WHERE visit_id = ? AND phone = ?')
      .get(visitId, phone),
  );
}
