import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { executeMaintenanceRollback } from './maintenance-rollback.js';
import { managerStatePath } from './manager-state.js';
import { testSetupContext } from './test-helpers/test-setup-context.js';

test('maintenance rollback fails when probes pass but an expected service is unhealthy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rollback-health-'));
  const rollbackDir = path.join(root, 'rollback');
  fs.mkdirSync(rollbackDir, { recursive: true });
  fs.writeFileSync(path.join(root, '.env'), 'PROXY_ENABLED=false\n');
  fs.writeFileSync(path.join(rollbackDir, '.env'), 'PROXY_ENABLED=false\n');
  try {
    const result = await executeMaintenanceRollback({
      ctx: testSetupContext(root),
      rollback: {
        rollbackDir,
        managerStatePath: managerStatePath(root),
        appDataDir: path.join(rollbackDir, 'app-data'),
      },
      appDataAccess: {
        listPresentDbFiles: async () => [],
        moveDbAside: async () => {},
        backupDbFiles: async () => [],
        restoreDbFiles: async () => {},
      },
      runtime: {
        stopStack: async () => ({ ok: true, log: '' }),
        startFullStack: async () => ({ ok: true, log: '', gatewaySkipped: false }),
        runHealthChecks: async () => ({ ok: true, errors: [] }),
        composeStatus: async () => ({
          running: true,
          services: [
            { name: 'app', service: 'app', state: 'running', health: 'healthy' },
            { name: 'sandbox', service: 'sandbox', state: 'running', health: 'unhealthy' },
          ],
        }),
        stackHealthWaitOptions: { timeoutMs: 0 },
      },
      localAppBaseUrl: 'http://127.0.0.1:8080',
      failedDbDirName: 'failed-db',
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /sandbox.*unhealthy/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const fault of [
  null,
  'bindings',
  'listener',
  'throw',
  'invalid-contract',
  'stop-fails',
] as const)
  test(`rollback audits restored contract and closes unverified runtime: ${fault ?? 'success'}`, async () => {
    const { DEFAULT_PORTAL_PROXY_CONTRACT } = await import('@wartezimmer/server-shared');
    const { runtimeAuditEnv, runtimeAuditCompose } =
      await import('./test-helpers/runtime-postcondition-test-fixtures.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rollback-audit-'));
    const rollbackDir = path.join(root, 'rollback');
    const oldContract = structuredClone(DEFAULT_PORTAL_PROXY_CONTRACT);
    oldContract.api = [{ method: 'GET', path: '/api/v1/portal/old-release' }];
    const observedContracts: unknown[] = [];
    let stops = 0;
    let healthChecks = 0;
    try {
      fs.mkdirSync(path.join(rollbackDir, 'tls-state'), { recursive: true });
      fs.mkdirSync(path.join(root, 'state/tls'), { recursive: true });
      const env = Object.entries(runtimeAuditEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      fs.writeFileSync(path.join(root, '.env'), env);
      fs.writeFileSync(path.join(rollbackDir, '.env'), env);
      fs.writeFileSync(
        path.join(root, 'state/tls/portal-contract.json'),
        JSON.stringify(DEFAULT_PORTAL_PROXY_CONTRACT),
      );
      fs.writeFileSync(
        path.join(rollbackDir, 'tls-state/portal-contract.json'),
        fault === 'invalid-contract' ? '{broken' : JSON.stringify(oldContract),
      );
      const compose = runtimeAuditCompose();
      if (fault === 'bindings') compose.services[2]!.publishedBindings![0]!.hostIp = '0.0.0.0';
      const result = await executeMaintenanceRollback({
        ctx: testSetupContext(root),
        rollback: {
          rollbackDir,
          managerStatePath: managerStatePath(root),
          appDataDir: path.join(rollbackDir, 'app-data'),
        },
        appDataAccess: {
          listPresentDbFiles: async () => [],
          moveDbAside: async () => {},
          backupDbFiles: async () => [],
          restoreDbFiles: async () => {},
        },
        runtime: {
          stopStack: async () => ({
            ok: ++stops === 1 || fault !== 'stop-fails',
            log: 'stop rejected',
          }),
          startFullStack: async () => ({ ok: true, log: '', gatewaySkipped: false }),
          composeStatus: async () => compose,
          runHealthChecks: async () => {
            healthChecks++;
            return { ok: true, errors: [] };
          },
          auditProxyContract: async (input) => {
            observedContracts.push(input.contract);
            if (fault === 'throw') throw new Error('probe failed');
            return fault === 'listener' || fault === 'stop-fails' ? 'policy mismatch' : null;
          },
        },
        localAppBaseUrl: 'http://127.0.0.1:8080',
        failedDbDirName: 'failed-db',
      });
      assert.equal(result.ok, fault === null, JSON.stringify(result));
      assert.equal(stops, fault ? 2 : 1);
      assert.equal(healthChecks, fault ? 0 : 1);
      assert.deepEqual(
        observedContracts,
        fault === 'bindings' || fault === 'invalid-contract' ? [] : [oldContract],
      );
      if (fault === 'stop-fails') assert.match(result.errors.join(' '), /stop rejected/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
