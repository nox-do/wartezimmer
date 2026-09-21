import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSetupRequestHandler, type SetupRequestHandlerOptions } from './server.js';
import type { SetupContext } from './setup-context.js';
import { testSetupContext } from './test-setup-context.js';
import { SETUP_API_PROTOCOL_VERSION, SETUP_MANAGER_TOKEN_HEADER } from '@praxis-flow/server-shared';

const testContext: SetupContext = {
  home: '/unused',
  mode: 'repo',
  composeProjectName: 'test',
  templateRoot: '/unused',
};

async function startTestServer(
  options: SetupRequestHandlerOptions & { context?: SetupContext } = {},
) {
  const { context = testContext, ...handlerOptions } = options;
  const server = http.createServer(
    createSetupRequestHandler(
      context,
      9190,
      {},
      {
        managerToken: null,
        ...handlerOptions,
      },
    ),
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

test('setup server rejects package paths with the wrong extension', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  for (const [route, archivePath, expected] of [
    ['/api/setup/host/images/load', '/tmp/release.tar.gz', '.pfinstall'],
    ['/api/setup/host/update/inspect', '/tmp/update.tar.gz', '.pfupdate'],
    ['/api/setup/host/update/apply', '/tmp/update.zip', '.pfupdate'],
  ] as const) {
    const response = await fetch(`${server.baseUrl}${route}`, {
      method: 'POST',
      body: JSON.stringify({ archivePath, managerVersion: '0.4.0' }),
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, `archivePath must end with ${expected}`);
  }
});

test('install operation routes validate prepare, commit and DELETE abort bodies', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  const prepare = await fetch(`${server.baseUrl}/api/setup/host/install/prepare`, {
    method: 'POST',
    body: JSON.stringify({ archivePath: '/tmp/release.pfinstall', mode: 'unknown' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(prepare.status, 400);
  assert.deepEqual(await prepare.json(), { error: 'mode must be fresh or replace' });

  const commit = await fetch(`${server.baseUrl}/api/setup/host/install/commit`, {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(commit.status, 400);
  assert.deepEqual(await commit.json(), { error: 'operationId required' });

  const abort = await fetch(`${server.baseUrl}/api/setup/host/install/operation`, {
    method: 'DELETE',
    body: '{}',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(abort.status, 400);
  assert.deepEqual(await abort.json(), { error: 'operationId required' });
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

test('rebuild endpoint refuses a missing env without reconstructing an installation', async (t) => {
  const server = await startTestServer();
  t.after(server.close);
  const response = await fetch(`${server.baseUrl}/api/setup/host/rebuild`, { method: 'POST' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Wartung ist nur bei einer gesunden Installation/);
});

test('HTTP rebuild waits for startup recovery and rejects an unhealthy installation', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-server-rebuild-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(home, '.env'),
    'SETUP_LAN_APP_IP=192.168.1.10\nPROXY_ENABLED=false\nPROXY_MODE=off\n',
  );
  fs.mkdirSync(path.join(home, 'state/restricted-operation'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'state/restricted-operation/journal.json'),
    JSON.stringify({
      version: 1,
      id: 'pending',
      pid: 123,
      stackWasRunning: false,
      action: 'pending-apply',
      previousEnv: fs.readFileSync(path.join(home, '.env'), 'utf8'),
      previousCaddyfile: null,
    }),
  );
  let releaseRecovery!: () => void;
  let recoveryCompleted = false;
  const pendingRecovery = new Promise<void>((resolve) => {
    releaseRecovery = () => {
      recoveryCompleted = true;
      resolve();
    };
  });
  const server = await startTestServer({
    context: testSetupContext(home),
    recoverRestrictedOperation: async () => pendingRecovery,
  });
  t.after(server.close);

  let responseFinished = false;
  const responsePromise = fetch(`${server.baseUrl}/api/setup/host/rebuild`, {
    method: 'POST',
  }).then((response) => {
    responseFinished = true;
    return response;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(responseFinished, false);
  releaseRecovery();
  const response = await responsePromise;

  assert.equal(recoveryCompleted, true);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Wartung ist nur bei einer gesunden Installation/);
  assert.ok(fs.existsSync(path.join(home, 'state/restricted-operation/journal.json')));
});
