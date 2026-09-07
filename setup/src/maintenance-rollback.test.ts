import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { executeMaintenanceRollback } from './maintenance-rollback.js';
import { managerStatePath } from './manager-state.js';
import { testSetupContext } from './test-setup-context.js';

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
