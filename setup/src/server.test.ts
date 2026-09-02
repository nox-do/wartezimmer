import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createSetupRequestHandler } from './server.js';
import type { SetupContext } from './setup-context.js';
import {
  SETUP_API_PROTOCOL_VERSION,
  SETUP_MANAGER_TOKEN_HEADER,
} from '@praxis-flow/server-shared';

const testContext: SetupContext = {
  home: '/unused',
  mode: 'repo',
  composeProjectName: 'test',
  templateRoot: '/unused',
};

async function startTestServer(options?: { managerToken?: string | null; buildId?: string }) {
  const server = http.createServer(
    createSetupRequestHandler(testContext, 9190, {}, { managerToken: null, ...options }),
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test('setup server returns 404 for an unknown route', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/unknown`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not found' });
});

test('setup server treats malformed JSON as a client error', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/setup/host/update/inspect`, {
    method: 'POST',
    body: '{',
    headers: { 'content-type': 'application/json' },
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /JSON/);
});

test('setup server preserves route validation errors', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/setup/host/update/inspect`, {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'archivePath required' });
});

test('TLS prepare route validates its contract before touching host state', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/setup/host/tls/prepare`, {
    method: 'POST',
    body: JSON.stringify({ mode: 'custom', lanIp: '192.168.178.112' }),
    headers: { 'content-type': 'application/json' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'hostname required for custom TLS' });
});

test('setup health reports protocol, build and install-home identity', async (t) => {
  const server = await startTestServer({ buildId: 'setup-test-1' });
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/setup/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    protocolVersion: SETUP_API_PROTOCOL_VERSION,
    buildId: 'setup-test-1',
    installHome: '/unused',
    composeProjectName: 'test',
  });
});

test('setup server rejects requests without the configured manager token', async (t) => {
  const server = await startTestServer({ managerToken: 'secret-token' });
  t.after(server.close);

  const unauthenticated = await fetch(`${server.baseUrl}/api/setup/health`);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { error: 'setup token required' });

  const authenticated = await fetch(`${server.baseUrl}/api/setup/health`, {
    headers: { [SETUP_MANAGER_TOKEN_HEADER]: 'secret-token' },
  });
  assert.equal(authenticated.status, 200);
  assert.equal((await authenticated.json()).ok, true);
});
