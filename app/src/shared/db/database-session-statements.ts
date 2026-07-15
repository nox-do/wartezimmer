import type { DatabaseSync } from 'node:sqlite';

export function prepareSessionDatabaseStatements(db: DatabaseSync) {
  return {
    insertPatientSessionStmt: db.prepare(
      `INSERT INTO patient_sessions (id, visit_id, token_hash, status, expires_at, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    ),
    expireActiveSessionsByVisitStmt: db.prepare(
      "UPDATE patient_sessions SET status = 'revoked', updated_at = ? WHERE visit_id = ? AND status = 'active'",
    ),
    getActiveSessionByVisitStmt: db.prepare(
      `SELECT id
      FROM patient_sessions
      WHERE visit_id = ? AND status = 'active' AND expires_at > ?
      LIMIT 1`,
    ),
    getPatientSessionByTokenStmt: db.prepare(
      `SELECT id AS sessionId, visit_id AS visitId, expires_at AS expiresAt, status, created_at AS createdAt
      FROM patient_sessions
      WHERE token_hash = ?
      LIMIT 1`,
    ),
    touchPatientSessionStmt: db.prepare(
      'UPDATE patient_sessions SET last_seen_at = ?, updated_at = ? WHERE id = ?',
    ),
    expirePatientSessionStmt: db.prepare(
      "UPDATE patient_sessions SET status = 'expired', updated_at = ? WHERE id = ?",
    ),
    revokePatientSessionStmt: db.prepare(
      "UPDATE patient_sessions SET status = 'revoked', updated_at = ? WHERE id = ?",
    ),
  };
}
