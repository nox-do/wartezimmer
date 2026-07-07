import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerClientAuth } from './client-auth.js';
import { registerOpsSettingsRoutes } from '../routes/ops/ops-settings-routes.js';
import type { CoreDatabase } from '../shared/db/database.js';

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

test('manager-local header grants ops access to routing capabilities without session', async (t) => {
  saveEnv();
  t.after(restoreEnv);
  process.env.NODE_ENV = 'test';
  process.env.AUTH_ENABLED = 'true';
  process.env.AUTH_KEY_CAPTIVE = 'test-captive-key-with-sufficient-length-32';

  const app = Fastify({ logger: false });
  registerClientAuth(app);
  registerOpsSettingsRoutes(
    app,
    {
      getRoutingCapabilities: () => ({
        routingMode: 'simple',
        features: {
          complexRouting: false,
          journeyDesigner: false,
          routingSimulator: true,
          complexRoutingLicensed: true,
        },
      }),
    } as unknown as CoreDatabase,
    {},
  );

  await app.ready();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/settings/capabilities',
    headers: {
      'x-praxis-manager-local': '1',
      'x-forwarded-for': '127.0.0.1',
    },
    remoteAddress: '127.0.0.1',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().routingMode, 'simple');
  await app.close();
});

test('manager-local patch rejects non-routingMode fields', async (t) => {
  saveEnv();
  t.after(restoreEnv);
  process.env.NODE_ENV = 'test';
  process.env.AUTH_ENABLED = 'true';
  process.env.AUTH_KEY_CAPTIVE = 'test-captive-key-with-sufficient-length-32';

  const app = Fastify({ logger: false });
  registerClientAuth(app);
  registerOpsSettingsRoutes(
    app,
    {
      getOpsSettings: () => ({ routingMode: 'simple' }),
      updateOpsSettings: () => ({ routingMode: 'complex' }),
    } as unknown as CoreDatabase,
    {},
  );

  await app.ready();
  const response = await app.inject({
    method: 'PATCH',
    url: '/api/v1/ops/settings',
    headers: {
      'content-type': 'application/json',
      'x-praxis-manager-local': '1',
    },
    payload: { routingMode: 'complex', topics: [] },
    remoteAddress: '127.0.0.1',
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'AUTH_FORBIDDEN');
  await app.close();
});
