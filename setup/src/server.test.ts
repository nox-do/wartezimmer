import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createSetupRequestHandler } from './server.js';
import type { SetupContext } from './setup-context.js';

const testContext: SetupContext = {
  home: '/unused',
  mode: 'repo',
  composeProjectName: 'test',
  templateRoot: '/unused',
};

async function startTestServer() {
  const server = http.createServer(createSetupRequestHandler(testContext));
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
