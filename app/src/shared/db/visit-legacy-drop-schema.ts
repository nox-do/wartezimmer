import type { DatabaseSync } from 'node:sqlite';

function tableExists(db: DatabaseSync, table: string): boolean {
  const row = db
    .prepare("SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { exists_flag?: number } | undefined;
  return row?.exists_flag === 1;
}

/** Phase B3: drop legacy queue tables after portal/docs migrated to visits. */
export function ensureVisitLegacyDropSchema(db: DatabaseSync): void {
  if (!tableExists(db, 'visits')) {
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    if (tableExists(db, 'queue_entries')) {
      db.exec('DROP TABLE queue_entries');
    }
    if (tableExists(db, 'tickets')) {
      db.exec('DROP INDEX IF EXISTS idx_tickets_status_created');
      db.exec('DROP TABLE tickets');
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
