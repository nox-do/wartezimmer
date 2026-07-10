import type { DatabaseSync } from 'node:sqlite';

/** Additive Spalten für bestehende DBs (CREATE TABLE IF NOT EXISTS ändert nichts). */
export function ensureVisitSupersedeColumns(db: DatabaseSync): void {
  const columns = (
    db.prepare('PRAGMA table_info(visits)').all() as Array<{ name?: string }>
  ).map((row) => row.name);

  if (!columns.includes('supersedes_visit_id')) {
    db.exec('ALTER TABLE visits ADD COLUMN supersedes_visit_id TEXT');
  }
  if (!columns.includes('superseded_by_visit_id')) {
    db.exec('ALTER TABLE visits ADD COLUMN superseded_by_visit_id TEXT');
  }
}
