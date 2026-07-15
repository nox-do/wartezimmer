import type { DatabaseSync } from 'node:sqlite';

/** Additive Audit-Spalten für bestehende Flow-Core-Datenbanken. */
export function ensureVisitEventAuditColumns(db: DatabaseSync): void {
  const columns = (
    db.prepare('PRAGMA table_info(visit_events)').all() as Array<{ name?: string }>
  ).map((row) => row.name);
  const sequenceAdded = !columns.includes('sequence');
  const fromNameAdded = !columns.includes('from_location_name');
  const toNameAdded = !columns.includes('to_location_name');

  if (sequenceAdded) {
    db.exec('ALTER TABLE visit_events ADD COLUMN sequence INTEGER');
  }
  if (fromNameAdded) {
    db.exec('ALTER TABLE visit_events ADD COLUMN from_location_name TEXT');
  }
  if (toNameAdded) {
    db.exec('ALTER TABLE visit_events ADD COLUMN to_location_name TEXT');
  }

  const hasMissingSequence = db
    .prepare('SELECT 1 FROM visit_events WHERE sequence IS NULL LIMIT 1')
    .get();
  if (hasMissingSequence) {
    db.exec(`UPDATE visit_events AS current
      SET sequence = (
        SELECT COUNT(*)
        FROM visit_events AS candidate
        WHERE candidate.visit_id = current.visit_id
          AND (
            candidate.created_at < current.created_at
            OR (candidate.created_at = current.created_at AND candidate.rowid <= current.rowid)
          )
      )`);
  }
  if (fromNameAdded) {
    db.exec(`UPDATE visit_events
      SET from_location_name = (SELECT name FROM locations WHERE id = from_location_id)
      WHERE from_location_id IS NOT NULL`);
  }
  if (toNameAdded) {
    db.exec(`UPDATE visit_events
      SET to_location_name = (SELECT name FROM locations WHERE id = to_location_id)
      WHERE to_location_id IS NOT NULL`);
  }
  const hasSequenceIndex = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get('visit_events_visit_sequence_uq');
  if (!hasSequenceIndex) {
    db.exec(
      'CREATE UNIQUE INDEX visit_events_visit_sequence_uq ON visit_events (visit_id, sequence)',
    );
  }
}
