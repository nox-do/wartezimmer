import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { validateCatalogIntegrity } from '@praxis-flow/flow-core';
import { loadCatalog } from '@praxis-flow/flow-core/server';
import { createCurrentSchema } from '../db/create-current-schema.js';
import { exportSettingsSnapshotFromDb } from './settings-snapshot-export.js';
import {
  importSettingsSnapshotIntoDb,
  parseSettingsSnapshotV1,
  snapshotsEquivalentForRestore,
} from './settings-snapshot-import.js';
import { SettingsSnapshotError, SETTINGS_FORMAT_VERSION } from './settings-snapshot-types.js';

function openFreshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(db);
  return db;
}

function sampleEnv(): Record<string, string> {
  return {
    BUSINESS_TZ: 'Europe/Berlin',
    SETUP_LAN_APP_IP: '192.168.1.50',
    CANONICAL_BASE_URL: 'http://192.168.1.50:8080',
  };
}

function mutateTopicLabel(db: DatabaseSync, label: string): void {
  const row = db
    .prepare('SELECT topic_settings_json AS json FROM ops_settings WHERE id = ?')
    .get('singleton') as { json?: string };
  const topics = JSON.parse(row?.json ?? '[]') as Array<Record<string, unknown>>;
  const next = topics.map((topic) => (topic.topicId === 'blut' ? { ...topic, label } : topic));
  db.prepare('UPDATE ops_settings SET topic_settings_json = ? WHERE id = ?').run(
    JSON.stringify(next),
    'singleton',
  );
}

test('export and import produce equivalent restore snapshot', () => {
  const sourceDb = openFreshDb();
  mutateTopicLabel(sourceDb, 'Blut Export Label');
  sourceDb
    .prepare(
      "UPDATE messaging_provider_configs SET credentials_json = ?, enabled = 1 WHERE provider_id = 'seven'",
    )
    .run('{"apiKey":"test-secret"}');

  const exported = exportSettingsSnapshotFromDb(sourceDb, sampleEnv());

  const targetDb = openFreshDb();
  importSettingsSnapshotIntoDb(targetDb, exported);
  const reExported = exportSettingsSnapshotFromDb(targetDb, sampleEnv());

  assert.ok(snapshotsEquivalentForRestore(exported, reExported));
  assert.equal(
    snapshotsEquivalentForRestore(exported, { ...reExported, env: { FOO: 'other' } }),
    false,
  );

  const blut = (reExported.opsSettings.topics as Array<{ topicId: string; label: string }>).find(
    (topic) => topic.topicId === 'blut',
  );
  assert.equal(blut?.label, 'Blut Export Label');

  validateCatalogIntegrity(loadCatalog(targetDb));
});

test('import into fresh db validates catalog integrity', () => {
  const sourceDb = openFreshDb();
  const snapshot = exportSettingsSnapshotFromDb(sourceDb, sampleEnv());
  const freshDb = openFreshDb();

  importSettingsSnapshotIntoDb(freshDb, snapshot);
  validateCatalogIntegrity(loadCatalog(freshDb));
});

test('import rejects unknown settingsFormatVersion', () => {
  const db = openFreshDb();
  const snapshot = exportSettingsSnapshotFromDb(db, sampleEnv());

  assert.throws(
    () =>
      importSettingsSnapshotIntoDb(db, {
        ...snapshot,
        settingsFormatVersion: 99,
      }),
    (error: unknown) => {
      assert.ok(error instanceof SettingsSnapshotError);
      assert.equal(error.code, 'UNKNOWN_FORMAT_VERSION');
      return true;
    },
  );
});

test('import rejects invalid topics', () => {
  const db = openFreshDb();
  const snapshot = exportSettingsSnapshotFromDb(db, sampleEnv());

  assert.throws(
    () =>
      importSettingsSnapshotIntoDb(db, {
        ...snapshot,
        opsSettings: {
          ...snapshot.opsSettings,
          topics: [],
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SettingsSnapshotError);
      assert.equal(error.code, 'OPS_SETTINGS_INVALID');
      return true;
    },
  );
});

test('import rolls back when hook fails before commit', () => {
  const db = openFreshDb();
  const beforeLabel = 'Vor Rollback';
  mutateTopicLabel(db, beforeLabel);
  const snapshot = exportSettingsSnapshotFromDb(db, sampleEnv());
  mutateTopicLabel(db, 'Nach Rollback Versuch');

  assert.throws(
    () =>
      importSettingsSnapshotIntoDb(db, snapshot, {
        testHooks: {
          afterOpsSettingsWrite: () => {
            throw new Error('Injected import failure');
          },
        },
      }),
    /Injected import failure/,
  );

  const row = db
    .prepare('SELECT topic_settings_json AS json FROM ops_settings WHERE id = ?')
    .get('singleton') as { json?: string };
  const topics = JSON.parse(row.json) as Array<{ topicId: string; label: string }>;
  assert.equal(topics.find((topic) => topic.topicId === 'blut')?.label, 'Nach Rollback Versuch');
});

test('import without provider credentials clears credential blobs and disables external providers', () => {
  const sourceDb = openFreshDb();
  sourceDb
    .prepare(
      "UPDATE messaging_provider_configs SET credentials_json = ?, enabled = 1 WHERE provider_id = 'seven'",
    )
    .run('{"apiKey":"keep-me"}');

  const snapshot = exportSettingsSnapshotFromDb(sourceDb, sampleEnv());
  const targetDb = openFreshDb();
  const result = importSettingsSnapshotIntoDb(targetDb, snapshot, {
    skipProviderCredentials: true,
  });
  assert.deepEqual(
    [...result.disabledProviderIds].sort(),
    snapshot.messagingProviderConfigs
      .map((provider) => provider.providerId)
      .filter((providerId) => providerId !== 'mock')
      .sort(),
  );

  const row = targetDb
    .prepare(
      'SELECT credentials_json AS credentialsJson, enabled FROM messaging_provider_configs WHERE provider_id = ?',
    )
    .get('seven') as { credentialsJson?: string; enabled?: number } | undefined;
  assert.equal(row?.credentialsJson, '{}');
  assert.equal(row?.enabled, 0);
});

test('import rolls back ops auth and providers when catalog sync hook fails', () => {
  const db = openFreshDb();
  const beforeLabel = 'Vor Catalog-Fehler';
  mutateTopicLabel(db, beforeLabel);
  const snapshot = exportSettingsSnapshotFromDb(db, sampleEnv());
  mutateTopicLabel(db, 'Nach Import-Versuch');
  db.prepare("UPDATE auth_settings SET staff_pin_hash_mfa = ? WHERE id = 'singleton'").run(
    'changed-auth-hash',
  );
  db.prepare(
    "UPDATE messaging_provider_configs SET credentials_json = ? WHERE provider_id = 'seven'",
  ).run('{"apiKey":"before-import"}');

  assert.throws(
    () =>
      importSettingsSnapshotIntoDb(db, snapshot, {
        testHooks: {
          beforeCatalogSync: () => {
            throw new Error('Injected catalog sync failure');
          },
        },
      }),
    /Injected catalog sync failure/,
  );

  const topics = JSON.parse(
    (
      db
        .prepare('SELECT topic_settings_json AS json FROM ops_settings WHERE id = ?')
        .get('singleton') as { json?: string }
    ).json ?? '[]',
  ) as Array<{ topicId: string; label: string }>;
  assert.equal(topics.find((topic) => topic.topicId === 'blut')?.label, 'Nach Import-Versuch');

  const auth = db
    .prepare('SELECT staff_pin_hash_mfa AS hash FROM auth_settings WHERE id = ?')
    .get('singleton') as { hash?: string };
  assert.equal(auth.hash, 'changed-auth-hash');

  const seven = db
    .prepare(
      'SELECT credentials_json AS credentialsJson FROM messaging_provider_configs WHERE provider_id = ?',
    )
    .get('seven') as { credentialsJson?: string } | undefined;
  assert.equal(seven?.credentialsJson, '{"apiKey":"before-import"}');
});

test('parseSettingsSnapshotV1 accepts exported JSON shape', () => {
  const db = openFreshDb();
  const exported = exportSettingsSnapshotFromDb(db, sampleEnv());
  const parsed = parseSettingsSnapshotV1(JSON.parse(JSON.stringify(exported)));
  assert.equal(parsed.settingsFormatVersion, SETTINGS_FORMAT_VERSION);
  assert.equal(parsed.env.BUSINESS_TZ, 'Europe/Berlin');
});

test('settings snapshot import preserves an explicit null post-waiting call target', () => {
  const sourceDb = openFreshDb();
  sourceDb.prepare('UPDATE ops_settings SET post_waiting_call_target_id = NULL').run();
  const snapshot = exportSettingsSnapshotFromDb(sourceDb, sampleEnv());

  const targetDb = openFreshDb();
  importSettingsSnapshotIntoDb(targetDb, snapshot);

  const restored = targetDb
    .prepare('SELECT post_waiting_call_target_id AS value FROM ops_settings WHERE id = ?')
    .get('singleton') as { value: string | null };
  assert.equal(restored.value, null);
});

test('settings snapshot import defaults a missing legacy post-waiting target to reception', () => {
  const sourceDb = openFreshDb();
  const snapshot = exportSettingsSnapshotFromDb(sourceDb, sampleEnv());
  const { postWaitingCallTargetId: _omitted, ...legacyOpsSettings } = snapshot.opsSettings;

  const targetDb = openFreshDb();
  importSettingsSnapshotIntoDb(targetDb, {
    ...snapshot,
    opsSettings: legacyOpsSettings,
  });

  const restored = targetDb
    .prepare('SELECT post_waiting_call_target_id AS value FROM ops_settings WHERE id = ?')
    .get('singleton') as { value: string | null };
  assert.equal(restored.value, 'mfa-tresen');
});

test('settings snapshot roundtrip on file db', () => {
  const dir = mkdtempSync(join(tmpdir(), 'settings-snapshot-'));
  const dbPath = join(dir, 'test.db');
  try {
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON');
    createCurrentSchema(db);

    const snapshot = exportSettingsSnapshotFromDb(db, sampleEnv());
    db.close();

    const reopened = new DatabaseSync(dbPath);
    reopened.exec('PRAGMA foreign_keys = ON');
    importSettingsSnapshotIntoDb(reopened, snapshot);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
