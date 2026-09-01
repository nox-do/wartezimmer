import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { importSettingsSnapshotIntoDb } from '../settings/settings-snapshot-import.js';
import { exportSettingsSnapshotFromDb } from '../settings/settings-snapshot-export.js';
import {
  SCHEMA_GENERATION,
  SchemaGenerationUnsupportedError,
  assertForeignKeyIntegrity,
  assertSupportedSchemaGeneration,
  createCurrentSchema,
  isUninitializedDatabase,
  readSchemaGeneration,
  runTransitionSchemaEnsures,
} from './create-current-schema.js';
import { runMigrations } from './migrations-runner.js';

function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return rows.some((row) => row.name === column);
}

function tableReferences(db: DatabaseSync, table: string, referencedTable: string): boolean {
  const rows = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{ table?: string }>;
  return rows.some((row) => row.table === referencedTable);
}

test('createCurrentSchema builds generation-1 database with portal FKs', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  assert.equal(isUninitializedDatabase(db), true);
  createCurrentSchema(db);
  assert.equal(isUninitializedDatabase(db), false);
  assert.equal(readSchemaGeneration(db), SCHEMA_GENERATION);

  assert.equal(tableHasColumn(db, 'patient_sessions', 'visit_id'), true);
  assert.equal(tableHasColumn(db, 'documents', 'visit_id'), true);
  assert.equal(tableHasColumn(db, 'device_authorizations', 'token_hash'), true);
  assert.equal(tableReferences(db, 'patient_sessions', 'visits'), true);
  assert.equal(tableReferences(db, 'documents', 'visits'), true);

  assert.doesNotThrow(() => assertForeignKeyIntegrity(db));
});

test('assertSupportedSchemaGeneration allows legacy 0 and current generation', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(db);

  assert.doesNotThrow(() => assertSupportedSchemaGeneration(db));

  db.exec('PRAGMA user_version = 0');
  assert.doesNotThrow(() => assertSupportedSchemaGeneration(db));
});

test('assertSupportedSchemaGeneration rejects unknown future generation', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(db);
  db.exec('PRAGMA user_version = 2');

  assert.throws(
    () => assertSupportedSchemaGeneration(db),
    (error: unknown) => {
      assert.ok(error instanceof SchemaGenerationUnsupportedError);
      assert.equal(error.generation, 2);
      assert.match(error.message, /Backup\/Restore/);
      return true;
    },
  );
});

test('settings export/import round-trip on createCurrentSchema database', () => {
  const source = new DatabaseSync(':memory:');
  source.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(source);

  const snapshot = exportSettingsSnapshotFromDb(source, {
    BUSINESS_TZ: 'Europe/Berlin',
  });

  const target = new DatabaseSync(':memory:');
  target.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(target);

  const result = importSettingsSnapshotIntoDb(target, snapshot);
  assert.equal(result.opsSettings.routingMode, snapshot.opsSettings.routingMode);
  assert.equal(result.env.BUSINESS_TZ, 'Europe/Berlin');
  assert.doesNotThrow(() => assertForeignKeyIntegrity(target));
});

test('legacy database path: runTransitionSchemaEnsures without bumping user_version', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  runTransitionSchemaEnsures(db);

  assert.equal(readSchemaGeneration(db), 0);
  assert.equal(tableReferences(db, 'patient_sessions', 'visits'), true);
  assert.doesNotThrow(() => assertForeignKeyIntegrity(db));
});
