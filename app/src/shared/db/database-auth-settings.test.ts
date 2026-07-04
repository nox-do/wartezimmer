import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test, { afterEach } from 'node:test';
import { DEFAULT_ROOM_PANEL_PIN_HASH, DEFAULT_STAFF_PIN_HASH } from '@praxis-flow/server-shared';
import { hashStaffPinForConfig } from '../../auth/staff-session-auth.js';
import {
  ensureAuthSettingsSchema,
  getAuthSettingsFromDb,
  updateAuthPinHashInDb,
} from './database-auth-settings.js';

const ENV_KEYS = ['NODE_ENV'] as const;
const savedEnv = new Map<string, string | undefined>();

function saveEnv(): void {
  for (const key of ENV_KEYS) {
    if (!savedEnv.has(key)) {
      savedEnv.set(key, process.env[key]);
    }
  }
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
}

afterEach(() => {
  restoreEnv();
});

test('ensureAuthSettingsSchema seeds default PIN hashes for fresh databases', () => {
  saveEnv();
  process.env.NODE_ENV = 'test';

  const db = new DatabaseSync(':memory:');
  ensureAuthSettingsSchema(db);
  const settings = getAuthSettingsFromDb({
    getAuthSettingsStmt: db.prepare(`
      SELECT
        staff_pin_hash_mfa AS staffPinHashMfa,
        staff_pin_hash_ops AS staffPinHashOps,
        room_panel_pin_hash AS roomPanelPinHash,
        updated_at AS updatedAt
      FROM auth_settings
      WHERE id = 'singleton'
    `),
  });

  assert.equal(settings.staffPinHashMfa, DEFAULT_STAFF_PIN_HASH);
  assert.equal(settings.staffPinHashOps, DEFAULT_STAFF_PIN_HASH);
  assert.equal(settings.roomPanelPinHash, DEFAULT_ROOM_PANEL_PIN_HASH);
  db.close();
});

test('updateAuthPinHashInDb updates only the selected runtime PIN hash', () => {
  saveEnv();
  process.env.NODE_ENV = 'test';

  const db = new DatabaseSync(':memory:');
  ensureAuthSettingsSchema(db);
  const deps = {
    getAuthSettingsStmt: db.prepare(`
      SELECT
        staff_pin_hash_mfa AS staffPinHashMfa,
        staff_pin_hash_ops AS staffPinHashOps,
        room_panel_pin_hash AS roomPanelPinHash,
        updated_at AS updatedAt
      FROM auth_settings
      WHERE id = 'singleton'
    `),
    updateAuthPinHashStmt: db.prepare(`
      UPDATE auth_settings
      SET staff_pin_hash_mfa = COALESCE(?, staff_pin_hash_mfa),
          staff_pin_hash_ops = COALESCE(?, staff_pin_hash_ops),
          room_panel_pin_hash = COALESCE(?, room_panel_pin_hash),
          updated_at = ?
      WHERE id = 'singleton'
    `),
    nowIso: () => '2026-06-19T12:00:00.000Z',
  };

  const before = getAuthSettingsFromDb({ getAuthSettingsStmt: deps.getAuthSettingsStmt });
  const nextPanelHash = hashStaffPinForConfig('3333');
  const updated = updateAuthPinHashInDb(deps, 'room-panel', nextPanelHash);

  assert.equal(updated.staffPinHashMfa, before.staffPinHashMfa);
  assert.equal(updated.staffPinHashOps, before.staffPinHashOps);
  assert.equal(updated.roomPanelPinHash, nextPanelHash);
  assert.equal(updated.updatedAt, '2026-06-19T12:00:00.000Z');
  db.close();
});

test('updateAuthPinHashInDb updates only the Ops PIN hash', () => {
  saveEnv();
  process.env.NODE_ENV = 'test';

  const db = new DatabaseSync(':memory:');
  ensureAuthSettingsSchema(db);
  const deps = {
    getAuthSettingsStmt: db.prepare(`
      SELECT
        staff_pin_hash_mfa AS staffPinHashMfa,
        staff_pin_hash_ops AS staffPinHashOps,
        room_panel_pin_hash AS roomPanelPinHash,
        updated_at AS updatedAt
      FROM auth_settings
      WHERE id = 'singleton'
    `),
    updateAuthPinHashStmt: db.prepare(`
      UPDATE auth_settings
      SET staff_pin_hash_mfa = COALESCE(?, staff_pin_hash_mfa),
          staff_pin_hash_ops = COALESCE(?, staff_pin_hash_ops),
          room_panel_pin_hash = COALESCE(?, room_panel_pin_hash),
          updated_at = ?
      WHERE id = 'singleton'
    `),
    nowIso: () => '2026-06-19T12:00:00.000Z',
  };

  const before = getAuthSettingsFromDb({ getAuthSettingsStmt: deps.getAuthSettingsStmt });
  const nextOpsHash = hashStaffPinForConfig('5555');
  const updated = updateAuthPinHashInDb(deps, 'ops', nextOpsHash);

  assert.equal(updated.staffPinHashMfa, before.staffPinHashMfa);
  assert.equal(updated.staffPinHashOps, nextOpsHash);
  assert.equal(updated.roomPanelPinHash, before.roomPanelPinHash);
  assert.equal(updated.updatedAt, '2026-06-19T12:00:00.000Z');
  db.close();
});

test('ensureAuthSettingsSchema does not reseed when auth_settings already exists', () => {
  saveEnv();
  process.env.NODE_ENV = 'test';

  const db = new DatabaseSync(':memory:');
  ensureAuthSettingsSchema(db);

  const customMfa = hashStaffPinForConfig('9876');
  db.prepare(
    `UPDATE auth_settings SET staff_pin_hash_mfa = ?, updated_at = ? WHERE id = 'singleton'`,
  ).run(customMfa, '2026-06-19T12:00:00.000Z');

  ensureAuthSettingsSchema(db);

  const settings = getAuthSettingsFromDb({
    getAuthSettingsStmt: db.prepare(`
      SELECT
        staff_pin_hash_mfa AS staffPinHashMfa,
        staff_pin_hash_ops AS staffPinHashOps,
        room_panel_pin_hash AS roomPanelPinHash,
        updated_at AS updatedAt
      FROM auth_settings
      WHERE id = 'singleton'
    `),
  });

  assert.equal(settings.staffPinHashMfa, customMfa);
  db.close();
});
