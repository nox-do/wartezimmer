import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSetupRequestHandler, type SetupRequestHandlerOptions } from './server.js';
import type { SetupContext } from './setup-context.js';
import { testSetupContext } from './test-helpers/test-setup-context.js';
import { SETUP_API_PROTOCOL_VERSION, SETUP_MANAGER_TOKEN_HEADER } from '@wartezimmer/server-shared';

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
  assert.deepEqual(await response.json(), {
    error: {
      code: 'setup_route_not_found',
      category: 'validation',
      message: 'not found',
      retryable: false,
    },
  });
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
  assert.match((await response.json()).error.message, /JSON/);
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
  assert.deepEqual(await response.json(), {
    error: {
      code: 'validation_failed',
      category: 'validation',
      message: 'archivePath required',
      retryable: false,
    },
  });
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
    assert.equal((await response.json()).error.message, `archivePath must end with ${expected}`);
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
  assert.deepEqual(await prepare.json(), {
    error: {
      code: 'validation_failed',
      category: 'validation',
      message: 'mode must be fresh or replace',
      retryable: false,
    },
  });

  const commit = await fetch(`${server.baseUrl}/api/setup/host/install/commit`, {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(commit.status, 400);
  assert.deepEqual(await commit.json(), {
    error: {
      code: 'validation_failed',
      category: 'validation',
      message: 'operationId required',
      retryable: false,
    },
  });

  const abort = await fetch(`${server.baseUrl}/api/setup/host/install/operation`, {
    method: 'DELETE',
    body: '{}',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(abort.status, 400);
  assert.deepEqual(await abort.json(), {
    error: {
      code: 'validation_failed',
      category: 'validation',
      message: 'operationId required',
      retryable: false,
    },
  });
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
  assert.deepEqual(await response.json(), {
    error: {
      code: 'validation_failed',
      category: 'validation',
      message: 'hostname required for custom TLS',
      retryable: false,
    },
  });
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
  assert.deepEqual(await unauthenticated.json(), {
    error: {
      code: 'setup_auth_required',
      category: 'validation',
      message:
        'Der Manager konnte sich nicht an der lokalen Setup-API anmelden. Bitte Manager und Wartezimmer mit demselben Installationsstand neu starten.',
      retryable: false,
    },
  });

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
  assert.match(
    (await response.json()).error.message,
    /Wartung ist nur bei einer gesunden Installation/,
  );
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
  assert.match(
    (await response.json()).error.message,
    /Wartung ist nur bei einer gesunden Installation/,
  );
  assert.ok(fs.existsSync(path.join(home, 'state/restricted-operation/journal.json')));
});

test('host config survives Compose failure while runtime endpoints retain safe errors', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-http-observation-'));
  const cli = path.join(home, 'docker');
  const previous = process.env.WARTEZIMMER_DOCKER_CLI;
  t.after(() => {
    if (previous === undefined) delete process.env.WARTEZIMMER_DOCKER_CLI;
    else process.env.WARTEZIMMER_DOCKER_CLI = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.WARTEZIMMER_DOCKER_CLI = cli;
  fs.writeFileSync(path.join(home, '.env'), 'SETUP_LAN_APP_IP=192.168.1.10\n');
  fs.writeFileSync(
    cli,
    '#!/bin/sh\ncase "$*" in *"ps --all"*) echo private-docker-detail >&2; exit 1;; *"compose version"*) echo 2.24.4;; *) echo ok;; esac\n',
    { mode: 0o755 },
  );
  const server = await startTestServer({ context: { ...testSetupContext(home), mode: 'repo' } });
  t.after(server.close);
  for (const mode of ['http', 'tls-managed'] as const) {
    const tls = mode === 'tls-managed';
    fs.writeFileSync(
      path.join(home, '.env'),
      [
        'SETUP_LAN_APP_IP=192.168.1.10',
        'PROXY_ENABLED=true',
        `PROXY_MODE=${mode}`,
        `CANONICAL_BASE_URL=${tls ? 'https://staff.example' : 'http://192.168.1.10'}`,
        ...(tls
          ? [
              'TLS_STATE=active',
              'TLS_MODE=managed',
              'TLS_CUTOVER_APPLIED=true',
              'TLS_STAFF_HOSTNAME=staff.example',
            ]
          : []),
      ].join('\n'),
    );
    const response = await fetch(`${server.baseUrl}/api/setup/host/status`);
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.lifecycle.assessment, 'known');
    assert.equal(status.lifecycle.mode, tls ? 'https' : 'proxy-http');
    assert.equal(status.tls.state, tls ? 'active' : 'off');
    assert.equal(status.installation, null);
    assert.equal(status.compose, null);
    assert.deepEqual(status.probes, []);
    assert.equal(status.deviceUrls.mfa.startsWith(tls ? 'https://' : 'http://'), true);
  }
  for (const endpoint of ['runtime-health', 'compose']) {
    const response = await fetch(`${server.baseUrl}/api/setup/host/${endpoint}`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, 'compose_status_unavailable');
    assert.equal(body.error.category, 'unavailable');
    assert.equal(body.error.retryable, true);
    assert.doesNotMatch(JSON.stringify(body), /private-docker-detail|cause|services/);
  }
  // Durable diagnosis is still available without Compose.
  const operationDir = path.join(home, 'operations/install');
  fs.mkdirSync(operationDir, { recursive: true });
  fs.writeFileSync(path.join(operationDir, 'operation.json'), '{broken');
  const diagnosed = await fetch(`${server.baseUrl}/api/setup/host/status`);
  assert.equal(diagnosed.status, 200);
  assert.equal((await diagnosed.json()).installation.reasons[0].code, 'install-operation-invalid');

  const { updateOperationPath } = await import('./update-operation.js');
  fs.mkdirSync(path.dirname(updateOperationPath(home)), { recursive: true });
  fs.writeFileSync(updateOperationPath(home), '{private-invalid-journal');
  const updateStatus = await fetch(`${server.baseUrl}/api/setup/host/status`);
  assert.equal(updateStatus.status, 200);
  const updateBody = await updateStatus.json();
  assert.deepEqual(updateBody.updateOperation, { kind: 'unreadable' });
  assert.doesNotMatch(JSON.stringify(updateBody), /private-invalid-journal/);
  const blockedUpdate = await fetch(`${server.baseUrl}/api/setup/host/compose`, { method: 'POST' });
  assert.equal((await blockedUpdate.json()).error.code, 'update_operation_inconsistent');
  assert.equal(fs.readFileSync(updateOperationPath(home), 'utf8'), '{private-invalid-journal');

  // A genuinely unreadable configuration must still fail the config endpoint.
  fs.unlinkSync(path.join(home, '.env'));
  fs.mkdirSync(path.join(home, '.env'));
  const unreadable = await fetch(`${server.baseUrl}/api/setup/host/status`);
  assert.equal(unreadable.status, 500);
});

test('startup update recovery keeps reads available, runs once and blocks every mutation family', async (t) => {
  const { writeUpdateOperation, readUpdateOperation } = await import('./update-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'update-server-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  writeUpdateOperation(home, {
    schemaVersion: 1,
    id: '2026-09-28-server-test',
    createdAt: new Date().toISOString(),
    targetVersion: 'new',
    utilityImage: 'app:new',
    phase: 'cutover',
  });
  let calls = 0;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const server = await startTestServer({
    context: { ...testContext, home },
    recoverUpdateOperation: async () => {
      calls++;
      await pending;
      writeUpdateOperation(home, {
        ...readUpdateOperation(home)!,
        phase: 'recovery-failed',
        recovery: 'rollback',
      });
      return { ok: false, errors: ['test failure'] };
    },
    recoverRestrictedOperation: async () => {
      assert.fail('must not collide with update recovery');
    },
  });
  t.after(server.close);
  t.after(finish);
  assert.equal((await fetch(`${server.baseUrl}/api/setup/health`)).status, 200);
  const during = await fetch(`${server.baseUrl}/api/setup/host/update/apply`, { method: 'POST' });
  assert.equal((await during.json()).error.code, 'host_mutation_conflict');
  finish();
  // A read request is not a recovery trigger and does not discard failed evidence.
  assert.equal((await fetch(`${server.baseUrl}/api/setup/health`)).status, 200);
  for (const route of [
    'update/apply',
    'installation/start',
    'install/prepare',
    'backup/restore',
    'tls/apply',
    'network',
    'restricted-network/apply',
    'compose',
    'rebuild',
    'reset-staff-pins',
    'storage',
  ]) {
    const response = await fetch(`${server.baseUrl}/api/setup/host/${route}`, { method: 'POST' });
    assert.equal((await response.json()).error.code, 'update_operation_inconsistent', route);
  }
  assert.equal(calls, 1);
});

test('restore startup recovery leaves status readable, runs once and releases mutations after cleanup', async (t) => {
  const {
    writeRestoreOperation,
    readRestoreOperation,
    readRestoreOperationStatus,
    finishRestoreOperation,
    restoreRollbackDirectory,
  } = await import('./restore-operation.js');
  const { createPreparedInstallOperation, readInstallOperation } =
    await import('./install-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-http-'));
  const cliBefore = process.env.WARTEZIMMER_DOCKER_CLI;
  const cli = path.join(home, 'docker');
  fs.writeFileSync(cli, '#!/bin/sh\ncase "$*" in *"ps --all"*) exit 1;; *) echo ok;; esac\n', {
    mode: 0o755,
  });
  process.env.WARTEZIMMER_DOCKER_CLI = cli;
  fs.writeFileSync(path.join(home, '.env'), 'SETUP_LAN_APP_IP=192.168.1.10\n');
  t.after(() => {
    if (cliBefore === undefined) delete process.env.WARTEZIMMER_DOCKER_CLI;
    else process.env.WARTEZIMMER_DOCKER_CLI = cliBefore;
    fs.rmSync(home, { recursive: true, force: true });
  });
  writeRestoreOperation(home, {
    schemaVersion: 1,
    id: '2026-09-29-http-restore',
    createdAt: new Date().toISOString(),
    utilityImage: 'private-utility-image',
    installationId: null,
    phase: 'cutover',
  });
  const rollback = restoreRollbackDirectory(home, '2026-09-29-http-restore');
  fs.mkdirSync(rollback, { recursive: true });
  fs.copyFileSync(path.join(home, '.env'), path.join(rollback, '.env'));
  fs.writeFileSync(path.join(home, '.env'), 'SETUP_LAN_APP_IP=192.168.1.20\n');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const server = await startTestServer({
    context: { ...testContext, home },
    recoverRestoreOperation: async () => {
      calls++;
      await pending;
      fs.copyFileSync(path.join(rollback, '.env'), path.join(home, '.env'));
      const op = { ...readRestoreOperation(home)!, phase: 'recovered' as const };
      writeRestoreOperation(home, op);
      finishRestoreOperation(home, op);
      return { ok: true, errors: [] };
    },
    recoverRestrictedOperation: async () => assert.fail('restricted must not overtake restore'),
    recoverUpdateOperation: async () => assert.fail('update must not overtake restore'),
  });
  t.after(server.close);
  t.after(release);
  const status = await fetch(`${server.baseUrl}/api/setup/host/status`);
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.restoreOperation.kind, 'pending');
  assert.equal(body.network.configuredLanIp, '192.168.1.10');
  assert.doesNotMatch(JSON.stringify(body), /private-utility|utilityImage/);
  assert.doesNotMatch(JSON.stringify(body.restoreOperation), /installationId/);
  const busy = await fetch(`${server.baseUrl}/api/setup/host/tls/prepare`, { method: 'POST' });
  assert.equal((await busy.json()).error.code, 'host_mutation_conflict');
  release();
  await fetch(`${server.baseUrl}/api/setup/health`);
  assert.equal(readRestoreOperationStatus(home), null);
  const install = createPreparedInstallOperation({
    home,
    mode: 'fresh',
    sha256: 'a'.repeat(64),
    releaseVersion: '1',
  });
  const abort = await fetch(`${server.baseUrl}/api/setup/host/install/operation`, {
    method: 'DELETE',
    body: JSON.stringify({ operationId: install.id }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(abort.status, 200);
  assert.equal(readInstallOperation(home), null);
  assert.equal(calls, 1);
});

test('unreadable restore startup evidence remains a safe status and blocks HTTP mutations', async (t) => {
  const { restoreOperationPath } = await import('./restore-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-http-invalid-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(restoreOperationPath(home)), { recursive: true });
  fs.writeFileSync(restoreOperationPath(home), '{private-journal-detail');
  const server = await startTestServer({ context: { ...testContext, home } });
  t.after(server.close);
  const status = await fetch(`${server.baseUrl}/api/setup/host/status`);
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.deepEqual(body.restoreOperation, { kind: 'unreadable' });
  assert.doesNotMatch(JSON.stringify(body), /private-journal-detail/);
  for (const route of [
    'backup/restore',
    'update/apply',
    'install/prepare',
    'tls/apply',
    'network',
    'compose',
    'restricted-network/apply',
  ]) {
    const response = await fetch(`${server.baseUrl}/api/setup/host/${route}`, { method: 'POST' });
    assert.equal((await response.json()).error.code, 'restore_operation_inconsistent', route);
  }
  assert.equal(fs.readFileSync(restoreOperationPath(home), 'utf8'), '{private-journal-detail');
});

test('tls startup recovery leaves status readable, runs once and releases mutations after cleanup', async (t) => {
  const {
    writeTlsOperation,
    tlsIdentityReference,
    readTlsOperation,
    readTlsOperationStatus,
    finishTlsOperation,
    tlsRollbackDirectory,
  } = await import('./tls-operation.js');
  const { createPreparedInstallOperation, readInstallOperation } =
    await import('./install-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-http-'));
  const cliBefore = process.env.WARTEZIMMER_DOCKER_CLI;
  const cli = path.join(home, 'docker');
  fs.writeFileSync(cli, '#!/bin/sh\ncase "$*" in *"ps --all"*) exit 1;; *) echo ok;; esac\n', {
    mode: 0o755,
  });
  process.env.WARTEZIMMER_DOCKER_CLI = cli;
  fs.writeFileSync(
    path.join(home, '.env'),
    'SETUP_LAN_APP_IP=192.168.1.10\nPROXY_ENABLED=true\nPROXY_MODE=http\nCANONICAL_BASE_URL=http://192.168.1.10\n',
  );
  t.after(() => {
    if (cliBefore === undefined) delete process.env.WARTEZIMMER_DOCKER_CLI;
    else process.env.WARTEZIMMER_DOCKER_CLI = cliBefore;
    fs.rmSync(home, { recursive: true, force: true });
  });
  writeTlsOperation(home, {
    schemaVersion: 1,
    id: '2026-09-29-http-tls',
    createdAt: new Date().toISOString(),
    identity: tlsIdentityReference(
      new Map([
        ['PROXY_MODE', 'http'],
        ['CANONICAL_BASE_URL', 'http://192.168.1.10'],
      ]),
    ),
    action: 'cutover',
    phase: 'cutover',
  });
  const rollback = tlsRollbackDirectory(home, '2026-09-29-http-tls');
  fs.mkdirSync(rollback, { recursive: true });
  fs.copyFileSync(path.join(home, '.env'), path.join(rollback, '.env'));
  fs.writeFileSync(
    path.join(home, '.env'),
    'SETUP_LAN_APP_IP=192.168.1.20\nPROXY_ENABLED=true\nPROXY_MODE=tls-managed\nTLS_CUTOVER_APPLIED=true\nTLS_MODE=managed\nTLS_STATE=active\nTLS_HOSTNAME=staff.example.test\nCANONICAL_BASE_URL=https://staff.example.test\n',
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const server = await startTestServer({
    context: { ...testContext, home },
    recoverTlsOperation: async () => {
      calls++;
      await pending;
      fs.copyFileSync(path.join(rollback, '.env'), path.join(home, '.env'));
      const op = { ...readTlsOperation(home)!, phase: 'recovered' as const };
      writeTlsOperation(home, op);
      finishTlsOperation(home, op);
      return { ok: true, errors: [] };
    },
    recoverRestrictedOperation: async () => assert.fail('restricted must not overtake tls'),
    recoverUpdateOperation: async () => assert.fail('update must not overtake tls'),
  });
  t.after(server.close);
  t.after(release);
  const status = await fetch(`${server.baseUrl}/api/setup/host/status`);
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.tlsOperation.kind, 'pending');
  assert.equal(body.network.configuredLanIp, '192.168.1.10');
  assert.equal(body.lifecycle.mode, 'proxy-http');
  assert.equal(body.tls.cutoverApplied, false);
  assert.doesNotMatch(
    JSON.stringify(body.tlsOperation),
    /identity|action|PEM|private|acme|diagnostic/,
  );
  assert.doesNotMatch(JSON.stringify(body.tlsOperation), /installationId/);
  const busy = await fetch(`${server.baseUrl}/api/setup/host/tls/prepare`, { method: 'POST' });
  assert.equal((await busy.json()).error.code, 'host_mutation_conflict');
  release();
  await fetch(`${server.baseUrl}/api/setup/health`);
  assert.equal(readTlsOperationStatus(home), null);
  const install = createPreparedInstallOperation({
    home,
    mode: 'fresh',
    sha256: 'a'.repeat(64),
    releaseVersion: '1',
  });
  const abort = await fetch(`${server.baseUrl}/api/setup/host/install/operation`, {
    method: 'DELETE',
    body: JSON.stringify({ operationId: install.id }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(abort.status, 200);
  assert.equal(readInstallOperation(home), null);
  assert.equal(calls, 1);
});

test('unreadable tls startup evidence remains a safe status and blocks HTTP mutations', async (t) => {
  const { tlsOperationPath } = await import('./tls-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-http-invalid-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(tlsOperationPath(home)), { recursive: true });
  fs.writeFileSync(tlsOperationPath(home), '{private-journal-detail');
  const server = await startTestServer({ context: { ...testContext, home } });
  t.after(server.close);
  const status = await fetch(`${server.baseUrl}/api/setup/host/status`);
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.deepEqual(body.tlsOperation, { kind: 'unreadable' });
  assert.equal(body.lifecycle.assessment, 'unknown');
  assert.equal(body.lifecycle.mode, null);
  assert.equal(body.tls, undefined);
  assert.doesNotMatch(JSON.stringify(body), /private-journal-detail/);
  for (const route of [
    'backup/restore',
    'update/apply',
    'install/prepare',
    'tls/apply',
    'network',
    'compose',
    'restricted-network/apply',
  ]) {
    const response = await fetch(`${server.baseUrl}/api/setup/host/${route}`, { method: 'POST' });
    assert.equal((await response.json()).error.code, 'tls_operation_inconsistent', route);
  }
  assert.equal(fs.readFileSync(tlsOperationPath(home), 'utf8'), '{private-journal-detail');
});

test('startup recovers an interrupted binding preflight without touching runtime', async (t) => {
  const { beginBindingOperation, readBindingOperation } = await import('./binding-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'binding-http-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const envPath = path.join(home, '.env');
  fs.writeFileSync(envPath, 'SETUP_LAN_APP_IP=192.168.1.10\n');
  beginBindingOperation(home, true, false);
  fs.writeFileSync(envPath, 'SETUP_LAN_APP_IP=192.168.1.20\n');
  const server = await startTestServer({ context: { ...testContext, home } });
  t.after(server.close);
  assert.equal((await fetch(`${server.baseUrl}/api/setup/health`)).status, 200);
  assert.equal(fs.readFileSync(envPath, 'utf8'), 'SETUP_LAN_APP_IP=192.168.1.10\n');
  assert.equal(readBindingOperation(home), null);
});
