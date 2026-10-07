import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureVisitEventAuditColumns } from '@wartezimmer/flow-core/server';

test('Audit-Migration nummeriert bestehende Events und sichert Ortsnamen', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE locations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE visit_events (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL,
      from_location_id TEXT,
      to_location_id TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO locations VALUES ('waiting', 'Wartezimmer'), ('room', 'Raum 1');
    INSERT INTO visit_events VALUES
      ('event-1', 'visit-1', 'waiting', 'room', '2026-01-01T10:00:00.000Z'),
      ('event-2', 'visit-1', 'room', 'waiting', '2026-01-01T10:00:00.000Z');
  `);

  ensureVisitEventAuditColumns(db);

  const events = db
    .prepare(
      `SELECT sequence, from_location_name, to_location_name
       FROM visit_events ORDER BY sequence`,
    )
    .all()
    .map((row) => ({ ...row })) as Array<{
    sequence: number;
    from_location_name: string;
    to_location_name: string;
  }>;
  assert.deepEqual(events, [
    { sequence: 1, from_location_name: 'Wartezimmer', to_location_name: 'Raum 1' },
    { sequence: 2, from_location_name: 'Raum 1', to_location_name: 'Wartezimmer' },
  ]);
});
