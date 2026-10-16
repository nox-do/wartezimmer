import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PORTAL_PROXY_CONTRACT } from '@wartezimmer/server-shared';
import { createRuntimePostcondition } from './runtime-postcondition.js';
import { auditUpdateRuntimePostcondition } from './update-runtime-postcondition.js';
import {
  runtimeAuditEnv,
  runtimeAuditCompose,
} from './test-helpers/runtime-postcondition-test-fixtures.js';

test('HTTPS without portal verifies the configured local IP with the real hostname and certificate checks', async () => {
  const env = new Map(Object.entries(runtimeAuditEnv));
  env.delete('SETUP_RESTRICTED_ENABLED');
  const request = createRuntimePostcondition(env, null);
  let calls = 0;
  assert.equal(
    (
      await auditUpdateRuntimePostcondition(request, runtimeAuditCompose(false), {
        httpsProbe: async (ip, hostname, path, options) => {
          calls++;
          assert.equal(ip, runtimeAuditEnv.SETUP_LAN_APP_IP);
          assert.equal(hostname, runtimeAuditEnv.TLS_STAFF_HOSTNAME);
          assert.equal(path, '/api/v1/ops/health');
          assert.notEqual(options?.negative, true);
          return { status: 200, error: null };
        },
      })
    ).ok,
    true,
  );
  assert.equal(calls, 1);
  for (const response of [
    { status: null, error: 'certificate expired' },
    { status: 503, error: null },
  ]) {
    assert.equal(
      (
        await auditUpdateRuntimePostcondition(request, runtimeAuditCompose(false), {
          httpsProbe: async () => response,
        })
      ).ok,
      false,
    );
  }
});

test('HTTP proxy is checked directly and failed isolation is never downgraded', async () => {
  const env = new Map(Object.entries(runtimeAuditEnv));
  env.delete('SETUP_RESTRICTED_ENABLED');
  env.set('TLS_STATE', 'off');
  env.set('PROXY_MODE', 'http');
  const compose = runtimeAuditCompose(false);
  compose.services[2]!.publishedBindings = compose.services[2]!.publishedBindings!.filter(
    (b) => b.targetPort !== 443,
  );
  const request = createRuntimePostcondition(env, null);
  assert.equal(
    (
      await auditUpdateRuntimePostcondition(request, compose, {
        httpProbe: async (url) => {
          assert.equal(url, 'http://192.0.2.10:80/api/v1/ops/health');
          return { ok: true, status: 200, body: '' };
        },
      })
    ).ok,
    true,
  );
  compose.services[0]!.publishedBindings![0]!.hostIp = '0.0.0.0';
  assert.equal(
    (
      await auditUpdateRuntimePostcondition(request, compose, {
        httpProbe: async () => assert.fail('invalid bindings must fail first'),
      })
    ).ok,
    false,
  );
});

test('portal mode reuses full listener isolation audit and treats failures as hard errors', async () => {
  const request = createRuntimePostcondition(
    new Map(Object.entries(runtimeAuditEnv)),
    DEFAULT_PORTAL_PROXY_CONTRACT,
  );
  for (const error of [null, 'wrong portal policy']) {
    assert.equal(
      (
        await auditUpdateRuntimePostcondition(request, runtimeAuditCompose(), {
          auditListeners: async () => error,
          httpsProbe: async () => assert.fail('already covered by full listener audit'),
        })
      ).ok,
      error === null,
    );
  }
});
