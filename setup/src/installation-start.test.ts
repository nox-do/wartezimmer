import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectExistingAppDatabase, startExistingInstallation } from './installation-start.js';

test('database gate inspects the volume before using a read-only networkless container', async () => {
  const calls: string[][] = [];
  const result = await inspectExistingAppDatabase('pf-test', 'praxis-flow/app:1', async (args) => {
    calls.push(args);
    return { code: 0, stdout: '', stderr: '' };
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], ['volume', 'inspect', 'pf-test_app_data']);
  assert.ok(calls[1].includes('--network'));
  assert.ok(calls[1].includes('none'));
  assert.ok(calls[1].includes('--read-only'));
  assert.ok(calls[1].includes('pf-test_app_data:/var/lib/praxis-flow/app:ro'));
});

test('missing volume aborts without creating a utility container or starting compose', async () => {
  let composeStarted = false;
  const result = await startExistingInstallation(
    { projectRoot: '/tmp/test', composeProjectName: 'pf-test' },
    'praxis-flow/app:1',
    {
      runDocker: async () => ({ code: 1, stdout: '', stderr: 'missing' }),
      composeUp: async () => {
        composeStarted = true;
        return { ok: true, log: '', gatewaySkipped: false };
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(composeStarted, false);
});

test('start requires healthy core services and authenticated maintenance API', async () => {
  const result = await startExistingInstallation(
    { projectRoot: '/tmp/test', composeProjectName: 'pf-test' },
    'praxis-flow/app:1',
    {
      runDocker: async () => ({ code: 0, stdout: '', stderr: '' }),
      composeUp: async () => ({ ok: true, log: 'started', gatewaySkipped: false }),
      composePs: async () => ({
        running: true,
        services: [
          { name: 'pf-test-app-1', service: 'app', state: 'running', health: 'healthy' },
          {
            name: 'pf-test-sandbox-1',
            service: 'sandbox',
            state: 'running',
            health: 'healthy',
          },
          { name: 'pf-test-proxy-1', service: 'proxy', state: 'exited', health: 'unhealthy' },
        ],
      }),
      inspectMaintenance: async () => ({ authenticated: true, settingsFormatVersion: 1 }),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.maintenanceAuthenticated, true);
});
