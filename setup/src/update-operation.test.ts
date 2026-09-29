import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalAppDataAccess } from './app-data-volume.js';
import { captureMaintenanceRollback } from './maintenance-rollback.js';
import { recoverUpdateOperation, type PfupdateApplyDeps } from './settings-backup-update.js';
import {
  assertNoUpdateOperation,
  readUpdateOperation,
  readUpdateOperationStatus,
  updateOperationPath,
  updateRollbackDirectory,
  updateStagingDirectory,
  writeUpdateOperation,
  type UpdateOperation,
} from './update-operation.js';
import type { SetupContext } from './setup-context.js';

function fixture(t: test.TestContext) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'update-recovery-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const ctx: SetupContext = {
    home,
    mode: 'install',
    composeProjectName: 'test',
    templateRoot: home,
  };
  const data = path.join(home, 'data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'praxis-flow.db'), 'old-db');
  fs.writeFileSync(path.join(home, '.env'), 'PRAXIS_FLOW_APP_IMAGE=app:old\n');
  fs.writeFileSync(path.join(home, 'manager-state.json'), '{"release":{"releaseVersion":"old"}}');
  fs.writeFileSync(path.join(home, 'docker-compose.delivery.yml'), 'old-template');
  fs.mkdirSync(path.join(home, 'state/tls'), { recursive: true });
  fs.writeFileSync(path.join(home, 'state/tls/test-key'), 'private-key');
  const operation: UpdateOperation = {
    schemaVersion: 1,
    id: '2026-09-28-update-test',
    createdAt: new Date().toISOString(),
    targetVersion: 'new',
    utilityImage: 'app:new',
    phase: 'prepared',
  };
  writeUpdateOperation(home, operation);
  const calls: string[] = [];
  const appDataAccess = createLocalAppDataAccess(data);
  const deps: PfupdateApplyDeps = {
    appDataAccess,
    stopStack: async () => {
      calls.push('stop');
      return { ok: true, log: '' };
    },
    startFullStack: async () => {
      calls.push('start');
      return { ok: true, log: '', gatewaySkipped: false };
    },
    composeStatus: async () => ({
      running: true,
      services: ['app', 'sandbox'].map((service) => ({
        name: service,
        service,
        state: 'running',
        health: 'healthy',
      })),
    }),
    runHealthChecks: async () => {
      calls.push('verify');
      return { ok: true, errors: [] };
    },
  };
  async function snapshot() {
    const dir = updateRollbackDirectory(home, operation.id);
    await captureMaintenanceRollback(ctx, dir, appDataAccess);
    fs.mkdirSync(path.join(dir, 'compose-templates'));
    fs.copyFileSync(
      path.join(home, 'docker-compose.delivery.yml'),
      path.join(dir, 'compose-templates/docker-compose.delivery.yml'),
    );
    fs.writeFileSync(path.join(dir, 'compose-templates/caddyfile-was-absent'), '');
    writeUpdateOperation(home, { ...operation, phase: 'rollback-ready' });
  }
  function mutate() {
    writeUpdateOperation(home, { ...operation, phase: 'cutover' });
    fs.writeFileSync(path.join(home, '.env'), 'PRAXIS_FLOW_APP_IMAGE=app:new\n');
    fs.writeFileSync(path.join(home, 'manager-state.json'), '{"release":{"releaseVersion":"new"}}');
    fs.writeFileSync(path.join(home, 'docker-compose.delivery.yml'), 'new-template');
    fs.writeFileSync(path.join(home, 'state/tls/test-key'), 'new-key');
    fs.writeFileSync(path.join(data, 'praxis-flow.db'), 'new-db');
  }
  function assertOld() {
    assert.match(fs.readFileSync(path.join(home, '.env'), 'utf8'), /app:old/);
    assert.match(fs.readFileSync(path.join(home, 'manager-state.json'), 'utf8'), /old/);
    assert.equal(
      fs.readFileSync(path.join(home, 'docker-compose.delivery.yml'), 'utf8'),
      'old-template',
    );
    assert.equal(fs.readFileSync(path.join(home, 'state/tls/test-key'), 'utf8'), 'private-key');
    assert.equal(fs.readFileSync(path.join(data, 'praxis-flow.db'), 'utf8'), 'old-db');
  }
  return { home, ctx, operation, deps, calls, data, snapshot, mutate, assertOld };
}

test('interruption after stop with incomplete artifacts only restarts and verifies the old stack', async (t) => {
  const f = fixture(t);
  const partial = updateRollbackDirectory(f.home, f.operation.id);
  fs.mkdirSync(partial, { recursive: true });
  fs.writeFileSync(path.join(partial, '.env'), 'incomplete');
  const result = await recoverUpdateOperation(f.ctx, {
    ...f.deps,
    appDataAccess: {
      ...f.deps.appDataAccess!,
      restoreDbFiles: async () => {
        assert.fail('must not restore partial artifacts');
      },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls, ['start', 'verify']);
  f.assertOld();
  assert.equal(readUpdateOperation(f.home), null);
  assert.equal(fs.existsSync(partial), false);
});

test('completed snapshot before cutover still only restarts the original stack', async (t) => {
  const f = fixture(t);
  await f.snapshot();
  assert.equal((await recoverUpdateOperation(f.ctx, f.deps)).ok, true);
  assert.deepEqual(f.calls, ['start', 'verify']);
  f.assertOld();
});

test('interrupted cutover restores all previous state; failed runtime audit retains retryable sources', async (t) => {
  const f = fixture(t);
  await f.snapshot();
  f.mutate();
  const failed = await recoverUpdateOperation(f.ctx, {
    ...f.deps,
    runHealthChecks: async () => ({ ok: false, errors: ['secret docker output'] }),
  });
  assert.equal(failed.ok, false);
  assert.equal(readUpdateOperation(f.home)?.phase, 'recovery-failed');
  assert.throws(() => assertNoUpdateOperation(f.home), { code: 'update_operation_inconsistent' });
  assert.equal(JSON.stringify(readUpdateOperationStatus(f.home)).includes('secret'), false);
  assert.equal(
    fs.readFileSync(
      path.join(updateRollbackDirectory(f.home, f.operation.id), 'app-data/praxis-flow.db'),
      'utf8',
    ),
    'old-db',
  );
  f.assertOld();
  // Simulate another process interruption during rollback, after the DB copy.
  writeUpdateOperation(f.home, { ...f.operation, phase: 'rolling-back' });
  assert.equal((await recoverUpdateOperation(f.ctx, f.deps)).ok, true);
  f.assertOld();
  assert.equal(readUpdateOperation(f.home), null);
  assert.equal(fs.existsSync(updateRollbackDirectory(f.home, f.operation.id)), false);
  assert.equal((await recoverUpdateOperation(f.ctx, f.deps)).ok, true);
});

test('durable commit only cleans up, even with incomplete remaining recovery artifacts', async (t) => {
  const f = fixture(t);
  await f.snapshot();
  f.mutate();
  writeUpdateOperation(f.home, { ...f.operation, phase: 'committed' });
  const backup = path.join(f.home, 'pre-update.pfbackup');
  fs.writeFileSync(backup, 'keep');
  fs.mkdirSync(updateStagingDirectory(f.home, f.operation.id), { recursive: true });
  fs.rmSync(path.join(updateRollbackDirectory(f.home, f.operation.id), '.env'));
  assert.equal((await recoverUpdateOperation(f.ctx, f.deps)).ok, true);
  assert.deepEqual(f.calls, []);
  assert.match(fs.readFileSync(path.join(f.home, '.env'), 'utf8'), /app:new/);
  assert.equal(fs.readFileSync(path.join(f.data, 'praxis-flow.db'), 'utf8'), 'new-db');
  assert.equal(readUpdateOperation(f.home), null);
  assert.equal(fs.existsSync(backup), true);
  assert.equal(fs.existsSync(updateStagingDirectory(f.home, f.operation.id)), false);
});

test('failed restart preserves the restart decision without using partial artifacts', async (t) => {
  const f = fixture(t);
  assert.equal(
    (
      await recoverUpdateOperation(f.ctx, {
        ...f.deps,
        startFullStack: async () => {
          throw new Error('offline');
        },
      })
    ).ok,
    false,
  );
  const op = readUpdateOperation(f.home);
  assert.equal(op?.phase, 'recovery-failed');
  assert.ok(op?.phase === 'recovery-failed' && op.recovery === 'restart');
  assert.equal((await recoverUpdateOperation(f.ctx, f.deps)).ok, true);
  f.assertOld();
});

test('unreadable and invalid journals block all recovery mutation and remain byte-for-byte intact', async (t) => {
  const f = fixture(t);
  for (const text of [
    '{broken',
    JSON.stringify({ ...f.operation, id: '../outside' }),
    JSON.stringify({ ...f.operation, schemaVersion: 2 }),
    JSON.stringify({ ...f.operation, recovery: 'rollback' }),
  ]) {
    fs.writeFileSync(updateOperationPath(f.home), text);
    await assert.rejects(recoverUpdateOperation(f.ctx, f.deps));
    assert.throws(() => assertNoUpdateOperation(f.home), { code: 'update_operation_inconsistent' });
    assert.deepEqual(readUpdateOperationStatus(f.home), { kind: 'unreadable' });
    assert.equal(fs.readFileSync(updateOperationPath(f.home), 'utf8'), text);
  }
  assert.deepEqual(f.calls, []);
});

test('confirmed configuration follows the update decision and rejects missing recovery evidence', async (t) => {
  const { readConfirmedHostConfig } = await import('./confirmed-host-config.js');
  const f = fixture(t);
  await f.snapshot();
  f.mutate();
  const confirmed = readConfirmedHostConfig(f.home);
  assert.equal(confirmed.unknown, false);
  assert.equal(confirmed.env.get('PRAXIS_FLOW_APP_IMAGE'), 'app:old');
  assert.equal(confirmed.root, updateRollbackDirectory(f.home, f.operation.id));
  fs.unlinkSync(path.join(confirmed.root, '.env'));
  assert.equal(readConfirmedHostConfig(f.home).unknown, true);
  writeUpdateOperation(f.home, { ...f.operation, phase: 'committed' });
  assert.equal(readConfirmedHostConfig(f.home).env.get('PRAXIS_FLOW_APP_IMAGE'), 'app:new');
  fs.writeFileSync(updateOperationPath(f.home), 'broken');
  assert.equal(readConfirmedHostConfig(f.home).unknown, true);
});
