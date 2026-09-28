import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CoreDatabase } from '../../shared/db/database.js';
import { getSandboxClient } from '../../shared/sandbox/sandbox-client.js';
import { registerOpsDayLifecycleRoutes } from './ops-day-lifecycle-routes.js';
import { registerOpsMaintenanceRoutes } from './ops-maintenance-routes.js';
import { resetSandboxIntakeGateForTests } from '../../shared/sandbox/sandbox-intake-gate.js';

for (const kind of ['day', 'runtime'] as const) {
  test(`${kind} reset commits only after purge and confirmed restart; failures keep the lock`, async (t) => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'day-sandbox-lifecycle-'));
    t.after(() => {
      resetSandboxIntakeGateForTests();
      rmSync(temp, { force: true, recursive: true });
    });
    const oldContactPath = process.env.CONTACT_LOOKUP_BASE_PATH;
    process.env.CONTACT_LOOKUP_BASE_PATH = path.join(temp, 'contacts');
    t.after(() => {
      if (oldContactPath === undefined) delete process.env.CONTACT_LOOKUP_BASE_PATH;
      else process.env.CONTACT_LOOKUP_BASE_PATH = oldContactPath;
    });
    const db = new CoreDatabase(path.join(temp, 'test.db'));
    const app = Fastify();
    t.after(() => app.close());
    if (kind === 'day') registerOpsDayLifecycleRoutes(app, db);
    else registerOpsMaintenanceRoutes(app, db);
    const sandbox = getSandboxClient();
    let restartFails = true;
    let restarted = false;
    const order: string[] = [];
    t.mock.method(sandbox, 'purgeIntakeDay', async () => {
      order.push('purge');
      return { removed: 0, purgedAt: new Date().toISOString() };
    });
    t.mock.method(sandbox, 'requestRuntimeRestart', async () => {
      order.push('restart');
      assert.equal(db.isSandboxResetPending(), true);
      if (restartFails) throw new Error('offline');
      return { status: 'restarting', instanceId: 'old', initiatedAt: new Date().toISOString() };
    });
    t.mock.method(sandbox, 'getRuntimeInstanceId', async () => {
      restarted = true;
      return 'new';
    });
    const method = kind === 'day' ? 'resetBusinessDay' : 'executeRuntimeReset';
    const original = db[method].bind(db);
    t.mock.method(db, method, () => {
      assert.equal(restarted, true);
      order.push('commit');
      return original();
    });
    const request = {
      method: 'POST' as const,
      url:
        kind === 'day'
          ? '/api/v1/ops/day-lifecycle/reset'
          : '/api/v1/ops/maintenance/runtime-reset',
      payload:
        kind === 'day' ? { confirmBusinessDayReset: true } : { confirmPhrase: 'LAUFZEIT-RESET' },
    };
    const failed = await app.inject(request);
    assert.equal(failed.statusCode, 503, failed.body);
    assert.equal(db.isSandboxResetPending(), true);
    assert.deepEqual(order, ['purge', 'restart']);
    restartFails = false;
    order.length = 0;
    const recovered = await app.inject(request);
    assert.equal(recovered.statusCode, 200, recovered.body);
    assert.deepEqual(order, ['restart', 'purge', 'restart', 'commit']);
    assert.equal(db.isSandboxResetPending(), false);
  });
}
