import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(name) as { exists_flag?: number } | undefined;
  return row?.exists_flag === 1;
}

test('ensureFlowCoreSchema drops legacy tickets and queue_entries tables', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(join(migrationsDir, '001_baseline.sql'), 'utf8'));

  // Simulate pre-B3 upgrade: legacy tables still present.
  db.exec(`
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY,
      business_day TEXT NOT NULL,
      lane_code TEXT NOT NULL,
      number INTEGER NOT NULL,
      topic_id TEXT NOT NULL,
      topic_label TEXT NOT NULL,
      destination_room_id TEXT NOT NULL,
      destination_room_label TEXT NOT NULL,
      auth_path TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE queue_entries (
      ticket_id TEXT PRIMARY KEY,
      arrived_at TEXT NOT NULL
    );
  `);

  assert.equal(tableExists(db, 'tickets'), true);
  assert.equal(tableExists(db, 'queue_entries'), true);

  ensureFlowCoreSchema(db);

  assert.equal(tableExists(db, 'tickets'), false);
  assert.equal(tableExists(db, 'queue_entries'), false);
  assert.equal(tableExists(db, 'visits'), true);
});

test('fresh baseline never creates tickets or queue_entries', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(join(migrationsDir, '001_baseline.sql'), 'utf8'));
  ensureFlowCoreSchema(db);

  assert.equal(tableExists(db, 'tickets'), false);
  assert.equal(tableExists(db, 'queue_entries'), false);
});
