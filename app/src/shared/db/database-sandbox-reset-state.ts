import type { DatabaseSync, StatementSync } from 'node:sqlite';

export function ensureSandboxResetStateSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sandbox_reset_state (
      id TEXT PRIMARY KEY CHECK (id = 'singleton'),
      pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1)),
      started_at TEXT,
      updated_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO sandbox_reset_state (id, pending, started_at, updated_at)
    VALUES ('singleton', 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `);
}

export type SandboxResetStateStatements = {
  sandboxResetPendingStmt: StatementSync;
  markSandboxResetPendingStmt: StatementSync;
  clearSandboxResetPendingStmt: StatementSync;
};

export function prepareSandboxResetStateStatements(db: DatabaseSync): SandboxResetStateStatements {
  return {
    sandboxResetPendingStmt: db.prepare(
      "SELECT pending FROM sandbox_reset_state WHERE id = 'singleton' LIMIT 1",
    ),
    markSandboxResetPendingStmt: db.prepare(
      `UPDATE sandbox_reset_state
       SET pending = 1, started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = 'singleton'`,
    ),
    clearSandboxResetPendingStmt: db.prepare(
      `UPDATE sandbox_reset_state
       SET pending = 0, started_at = NULL, updated_at = ?
       WHERE id = 'singleton'`,
    ),
  };
}

export function isSandboxResetPendingFromStmt(statement: StatementSync): boolean {
  const row = statement.get() as { pending?: number } | undefined;
  return row?.pending === 1;
}
