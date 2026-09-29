import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { APP_DB_BASENAME } from './app-data-volume.js';
import {
  copyDeviceAuthorizationsFromAsideViaApp,
  readActiveDeviceAuthorizationsFromAside,
} from './device-authorizations-aside.js';

const baselineSql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../app/src/shared/db/migrations/001_baseline.sql',
  ),
  'utf8',
);

test('readActiveDeviceAuthorizationsFromAside skips missing file and missing table', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aside-missing-'));
  try {
    assert.deepEqual(readActiveDeviceAuthorizationsFromAside(dir), []);
    const empty = new DatabaseSync(join(dir, APP_DB_BASENAME));
    empty.exec('CREATE TABLE other (id TEXT)');
    empty.close();
    assert.deepEqual(readActiveDeviceAuthorizationsFromAside(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('copyDeviceAuthorizationsFromAsideViaApp skips HTTP when aside has no grants', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aside-copy-empty-'));
  try {
    const empty = new DatabaseSync(join(dir, APP_DB_BASENAME));
    empty.close();
    const result = await copyDeviceAuthorizationsFromAsideViaApp(dir, 'http://127.0.0.1:1');
    assert.deepEqual(result, { ok: true, imported: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readActiveDeviceAuthorizationsFromAside rejects an unknown source schema explicitly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aside-old-schema-'));
  try {
    const db = new DatabaseSync(join(dir, APP_DB_BASENAME));
    db.exec('CREATE TABLE device_authorizations (authorization_id TEXT PRIMARY KEY)');
    db.close();

    assert.throws(
      () => readActiveDeviceAuthorizationsFromAside(dir),
      /DEVICE_AUTHORIZATION_SCHEMA_UNSUPPORTED/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readActiveDeviceAuthorizationsFromAside copies only active rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aside-active-'));
  try {
    const db = new DatabaseSync(join(dir, APP_DB_BASENAME));
    db.exec(baselineSql);
    db.prepare(
      `INSERT INTO device_authorizations (
        authorization_id, role, device_id, room_id, placement,
        token_hash, created_at, last_seen_at, updated_at, revoked_at
      ) VALUES (?, 'tv', 'waiting-room', NULL, NULL, ?, ?, NULL, ?, NULL)`,
    ).run('auth-tv', 'a'.repeat(64), '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z');
    db.prepare(
      `INSERT INTO device_authorizations (
        authorization_id, role, device_id, room_id, placement,
        token_hash, created_at, last_seen_at, updated_at, revoked_at
      ) VALUES (?, 'room-panel', NULL, 'labor', 'inside', ?, ?, NULL, ?, ?)`,
    ).run(
      'auth-panel',
      'b'.repeat(64),
      '2026-09-01T10:00:00.000Z',
      '2026-09-01T10:00:00.000Z',
      '2026-09-01T11:00:00.000Z',
    );
    db.close();

    const rows = readActiveDeviceAuthorizationsFromAside(dir);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.role, 'tv');
    assert.equal(rows[0]?.authorizationId, 'auth-tv');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
