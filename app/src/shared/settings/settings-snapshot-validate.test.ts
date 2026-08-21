import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createCurrentSchema } from '../db/create-current-schema.js';
import { exportSettingsSnapshotFromDb } from './settings-snapshot-export.js';
import { validateSettingsSnapshotForRestore } from './settings-snapshot-validate.js';

function openFreshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(db);
  return db;
}

function validSnapshot() {
  const db = openFreshDb();
  return exportSettingsSnapshotFromDb(db, { BUSINESS_TZ: 'Europe/Berlin' });
}

test('validateSettingsSnapshotForRestore accepts valid snapshot', () => {
  const result = validateSettingsSnapshotForRestore(validSnapshot());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateSettingsSnapshotForRestore rejects invalid routing mode', () => {
  const snapshot = validSnapshot();
  const result = validateSettingsSnapshotForRestore({
    ...snapshot,
    opsSettings: {
      ...snapshot.opsSettings,
      routingMode: 'invalid',
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /routingMode/i);
});
