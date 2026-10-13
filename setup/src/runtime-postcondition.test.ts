import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PORTAL_PROXY_CONTRACT } from '@wartezimmer/server-shared';
import { createRuntimePostcondition, auditRuntimePostcondition } from './runtime-postcondition.js';
import {
  runtimeAuditEnv,
  runtimeAuditCompose,
} from './test-helpers/runtime-postcondition-test-fixtures.js';

test('audit keeps candidate identity and contract independent of later env/contract mutations', async () => {
  const env = new Map(Object.entries(runtimeAuditEnv));
  const contract = structuredClone(DEFAULT_PORTAL_PROXY_CONTRACT);
  const request = createRuntimePostcondition(env, contract);
  env.set('SETUP_RESTRICTED_ENABLED', 'false');
  contract.api = [{ method: 'GET', path: '/api/v1/portal/different' }];
  let calls = 0;
  const result = await auditRuntimePostcondition(request, runtimeAuditCompose(), {
    auditListeners: async (input) => {
      calls++;
      assert.equal(input.restrictedIp, runtimeAuditEnv.SETUP_RESTRICTED_APP_IP);
      assert.deepEqual(input.contract, DEFAULT_PORTAL_PROXY_CONTRACT);
      return null;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
});

for (const fault of [
  'missing-service',
  'unknown-bindings',
  'global-publish',
  'missing-contract',
  'missing-hostname',
  'proxy-off',
])
  test(`audit rejects ${fault} before any listener probe`, async () => {
    const env = new Map(Object.entries(runtimeAuditEnv));
    const compose = runtimeAuditCompose();
    if (fault === 'missing-service')
      compose.services = compose.services.filter((s) => s.name !== 'sandbox');
    if (fault === 'unknown-bindings') compose.services[2]!.publishedBindings = undefined;
    if (fault === 'global-publish') compose.services[2]!.publishedBindings![0]!.hostIp = '0.0.0.0';
    if (fault === 'missing-hostname') env.delete('TLS_PORTAL_HOSTNAME');
    if (fault === 'proxy-off') env.set('PROXY_ENABLED', 'false');
    const result = await auditRuntimePostcondition(
      createRuntimePostcondition(
        env,
        fault === 'missing-contract' ? null : DEFAULT_PORTAL_PROXY_CONTRACT,
      ),
      compose,
      {
        auditListeners: async () => {
          assert.fail('No probes with an invalid contract');
        },
      },
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.length);
  });

test('disabled Restricted still rejects a stale publish without requiring DNS or listener probes', async () => {
  const env = new Map(Object.entries(runtimeAuditEnv));
  env.delete('SETUP_RESTRICTED_ENABLED');
  const request = createRuntimePostcondition(env, null);
  const hooks = {
    auditListeners: async () => {
      assert.fail('Restricted is disabled');
    },
  };
  assert.equal((await auditRuntimePostcondition(request, runtimeAuditCompose(), hooks)).ok, false);
  assert.equal(
    (await auditRuntimePostcondition(request, runtimeAuditCompose(false), hooks)).ok,
    true,
  );
});

test('listener exceptions are failed postconditions', async () => {
  const result = await auditRuntimePostcondition(
    createRuntimePostcondition(
      new Map(Object.entries(runtimeAuditEnv)),
      DEFAULT_PORTAL_PROXY_CONTRACT,
    ),
    runtimeAuditCompose(),
    {
      auditListeners: async () => {
        throw new Error('probe failed');
      },
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /probe failed/);
});
