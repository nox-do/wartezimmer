import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {
  purgeSandboxIntakeForDayReset,
  requestSandboxRestartForDayReset,
} from './ops-sandbox-restart.js';

test('purge failure is propagated so the business-day reset can abort', async () => {
  const app = Fastify();
  const expected = new Error('SANDBOX_PURGE_FAILED:500');

  await assert.rejects(
    () =>
      purgeSandboxIntakeForDayReset(app, 'test', {
        purgeIntakeDay: async () => {
          throw expected;
        },
      }),
    (error: unknown) => error === expected,
  );
  await app.close();
});

test('runtime restart is confirmed by a changed sandbox instance id', async () => {
  const app = Fastify();
  let restartCalls = 0;

  const restarted = await requestSandboxRestartForDayReset(app, 'test', {
    requestRuntimeRestart: async () => {
      restartCalls += 1;
      return {
        status: 'restarting',
        instanceId: 'sandbox-old',
        initiatedAt: new Date().toISOString(),
      };
    },
    getRuntimeInstanceId: async () => 'sandbox-new',
  });

  assert.equal(restarted, true);
  assert.equal(restartCalls, 1);
  await app.close();
});
