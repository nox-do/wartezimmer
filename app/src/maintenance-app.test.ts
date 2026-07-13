import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { registerClientAuth } from './auth/client-auth.js';
import { registerOpsSettingsRoutes } from './routes/ops/ops-settings-routes.js';
import { registerOpsManagerMaintenanceRoutes } from './routes/ops/ops-manager-maintenance-routes.js';
import { CoreDatabase } from './shared/db/database.js';
import { createCurrentSchema } from './shared/db/create-current-schema.js';
import { exportSettingsSnapshotFromDb } from './shared/settings/settings-snapshot-export.js';
import {
  dbSnapshotsEquivalentForRestore,
  withDefaultEnvForSnapshotParse,
} from './shared/settings/settings-snapshot-import.js';

const ENV_KEYS = ['AUTH_ENABLED', 'AUTH_KEY_CAPTIVE', 'NODE_ENV'] as const;
const savedEnv = new Map<string, string | undefined>();

function saveEnv(): void {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
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
}

test('public app does not expose settings snapshot routes', async (t) => {
  saveEnv();
  t.after(restoreEnv);
  process.env.NODE_ENV = 'test';
  process.env.AUTH_ENABLED = 'true';
  process.env.AUTH_KEY_CAPTIVE = 'test-captive-key-with-sufficient-length-32';

  const app = Fastify({ logger: false });
  registerClientAuth(app);
  registerOpsSettingsRoutes(app, {} as unknown as CoreDatabase, {});

  await app.ready();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/settings/snapshot',
    headers: {
      'x-praxis-manager-local': '1',
      host: '127.0.0.1:8080',
    },
    remoteAddress: '172.18.0.1',
  });

  assert.equal(response.statusCode, 404);
  await app.close();
});

test('maintenance listener exports settings snapshot without auth headers', async (t) => {
  saveEnv();
  t.after(restoreEnv);
  process.env.BUSINESS_TZ = 'Europe/Berlin';

  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, {
    exportSettingsDbSnapshot: () => ({
      settingsFormatVersion: 1,
      exportedAt: '2026-07-12T12:00:00.000Z',
      opsSettings: { routingMode: 'simple' },
      authSettings: {
        staffPinHashMfa: 'a',
        staffPinHashOps: 'b',
        roomPanelPinHash: 'c',
      },
      messagingProviderConfigs: [],
    }),
  } as unknown as CoreDatabase);

  await app.ready();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/settings/snapshot',
    remoteAddress: '172.18.0.1',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().settingsFormatVersion, 1);
  assert.equal('env' in response.json(), false);
  await app.close();
});

test('maintenance validate endpoint rejects invalid settings snapshot', async () => {
  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, {} as unknown as CoreDatabase);

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/settings/snapshot/validate',
    headers: {
      'content-type': 'application/json',
    },
    payload: {
      settingsFormatVersion: 1,
      exportedAt: '2026-07-12T12:00:00.000Z',
      opsSettings: { routingMode: 'invalid' },
      authSettings: {
        staffPinHashMfa: 'a',
        staffPinHashOps: 'b',
        roomPanelPinHash: 'c',
      },
      messagingProviderConfigs: [],
      env: {},
    },
    remoteAddress: '172.18.0.1',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, false);
  assert.match(response.json().errors.join(' '), /routingMode/i);
  await app.close();
});

test('maintenance patch rejects non-routingMode fields', async () => {
  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, {
    getOpsSettings: () => ({ routingMode: 'simple' }),
    updateOpsSettings: () => ({ routingMode: 'complex' }),
  } as unknown as CoreDatabase);

  await app.ready();
  const response = await app.inject({
    method: 'PATCH',
    url: '/api/v1/ops/settings',
    headers: {
      'content-type': 'application/json',
    },
    payload: { routingMode: 'complex', topics: [] },
    remoteAddress: '172.18.0.1',
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'AUTH_FORBIDDEN');
  await app.close();
});

test('maintenance capabilities are readable without session', async () => {
  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, {
    getRoutingCapabilities: () => ({
      routingMode: 'complex',
      openVisitCount: 0,
      features: {
        complexRouting: true,
        journeyDesigner: true,
        routingSimulator: true,
        complexRoutingLicensed: true,
      },
    }),
  } as unknown as CoreDatabase);

  await app.ready();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/settings/capabilities',
    remoteAddress: '172.18.0.1',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().routingMode, 'complex');
  await app.close();
});

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

function buildSourceSnapshot() {
  const sourceDb = new DatabaseSync(':memory:');
  sourceDb.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(sourceDb);
  mutateTopicLabel(sourceDb, 'Blut Restore Label');
  sourceDb
    .prepare(
      "UPDATE messaging_provider_configs SET credentials_json = ?, enabled = 1 WHERE provider_id = 'seven'",
    )
    .run('{"apiKey":"restore-test-secret"}');
  return exportSettingsSnapshotFromDb(sourceDb, sampleEnv());
}

function withContactLookupBasePath(t: test.TestContext, dir: string): void {
  const previousContactLookupBase = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.CONTACT_LOOKUP_BASE_PATH = join(dir, 'imports');
  t.after(() => {
    if (previousContactLookupBase === undefined) {
      delete process.env.CONTACT_LOOKUP_BASE_PATH;
    } else {
      process.env.CONTACT_LOOKUP_BASE_PATH = previousContactLookupBase;
    }
  });
}

function buildInvalidTopicSnapshot() {
  const snapshot = buildSourceSnapshot();
  return {
    ...snapshot,
    opsSettings: {
      ...snapshot.opsSettings,
      topics: [],
    },
  };
}

test('maintenance import endpoint round-trips db settings on fresh schema', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'maintenance-import-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  withContactLookupBasePath(t, dir);

  const sourceSnapshot = buildSourceSnapshot();
  const targetDb = new CoreDatabase(join(dir, 'fresh.db'));
  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, targetDb);

  await app.ready();

  const importResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/settings/snapshot/import',
    headers: { 'content-type': 'application/json' },
    payload: withDefaultEnvForSnapshotParse(sourceSnapshot),
    remoteAddress: '127.0.0.1',
  });

  assert.equal(importResponse.statusCode, 200);
  const report = importResponse.json();
  assert.equal(report.ok, true);
  assert.equal(report.routingMode, sourceSnapshot.opsSettings.routingMode);
  assert.equal(report.catalogIntegrityOk, true);
  assert.equal(report.skipProviderCredentials, false);

  const exportResponse = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/settings/snapshot',
    remoteAddress: '127.0.0.1',
  });

  assert.equal(exportResponse.statusCode, 200);
  assert.ok(
    dbSnapshotsEquivalentForRestore(sourceSnapshot, exportResponse.json()),
    're-exported db snapshot should match source',
  );

  await app.close();
});

test('maintenance import endpoint rejects invalid snapshot', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'maintenance-import-invalid-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  withContactLookupBasePath(t, dir);

  const db = new CoreDatabase(join(dir, 'fresh.db'));
  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, db);

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/settings/snapshot/import',
    headers: { 'content-type': 'application/json' },
    payload: {
      settingsFormatVersion: 1,
      exportedAt: '2026-07-12T12:00:00.000Z',
      opsSettings: { routingMode: 'invalid' },
      authSettings: {
        staffPinHashMfa: 'a',
        staffPinHashOps: 'b',
        roomPanelPinHash: 'c',
      },
      messagingProviderConfigs: [],
      env: {},
    },
    remoteAddress: '127.0.0.1',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().ok, false);
  assert.equal(response.json().code, 'INVALID_SNAPSHOT');
  await app.close();
});

test('maintenance import endpoint supports skipProviderCredentials', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'maintenance-import-skip-creds-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  withContactLookupBasePath(t, dir);

  const sourceSnapshot = buildSourceSnapshot();
  const db = new CoreDatabase(join(dir, 'fresh.db'));
  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, db);

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/settings/snapshot/import?skipProviderCredentials=true',
    headers: { 'content-type': 'application/json' },
    payload: withDefaultEnvForSnapshotParse(sourceSnapshot),
    remoteAddress: '127.0.0.1',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().skipProviderCredentials, true);
  assert.equal(response.json().providerCredentialsSkipped, true);
  assert.deepEqual(
    [...response.json().disabledProviderIds].sort(),
    sourceSnapshot.messagingProviderConfigs
      .map((provider) => provider.providerId)
      .filter((providerId) => providerId !== 'mock')
      .sort(),
  );

  const exportResponse = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/settings/snapshot',
    remoteAddress: '127.0.0.1',
  });
  for (const provider of exportResponse.json().messagingProviderConfigs as Array<{
    providerId: string;
    enabled: boolean;
    credentialsJson: string;
  }>) {
    if (provider.providerId === 'mock') {
      continue;
    }
    assert.equal(provider.enabled, false);
    assert.equal(provider.credentialsJson, '{}');
  }
  await app.close();
});

test('maintenance validate and import reject the same invalid topic snapshot', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'maintenance-validate-import-invalid-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  withContactLookupBasePath(t, dir);

  const db = new CoreDatabase(join(dir, 'fresh.db'));
  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, db);
  await app.ready();

  const payload = withDefaultEnvForSnapshotParse(buildInvalidTopicSnapshot());

  const validateResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/settings/snapshot/validate',
    headers: { 'content-type': 'application/json' },
    payload,
    remoteAddress: '127.0.0.1',
  });
  const importResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/settings/snapshot/import',
    headers: { 'content-type': 'application/json' },
    payload,
    remoteAddress: '127.0.0.1',
  });

  assert.equal(validateResponse.statusCode, 200);
  assert.equal(validateResponse.json().ok, false);
  assert.equal(validateResponse.json().code, 'OPS_SETTINGS_INVALID');

  assert.equal(importResponse.statusCode, 400);
  assert.equal(importResponse.json().ok, false);
  assert.equal(importResponse.json().code, 'OPS_SETTINGS_INVALID');
  await app.close();
});

test('maintenance import rejects invalid skipProviderCredentials query values', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'maintenance-import-query-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  withContactLookupBasePath(t, dir);

  const db = new CoreDatabase(join(dir, 'fresh.db'));
  const app = Fastify({ logger: false });
  registerOpsManagerMaintenanceRoutes(app, db);
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/settings/snapshot/import?skipProviderCredentials=yes',
    headers: { 'content-type': 'application/json' },
    payload: withDefaultEnvForSnapshotParse(buildSourceSnapshot()),
    remoteAddress: '127.0.0.1',
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});
