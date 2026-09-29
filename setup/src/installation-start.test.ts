import assert from 'node:assert/strict';
import test from 'node:test';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import {
  inspectExistingAppDatabase,
  startExistingInstallation,
  type InstallationStartDependencies,
} from './installation-start.js';

const runOptions = { projectRoot: '/tmp/test', composeProjectName: 'pf-test' };
const appImage = 'praxis-flow/app:1';
const runDocker: NonNullable<InstallationStartDependencies['runDocker']> = async (args) => ({
  code: 0,
  stdout: args[0] === 'image' ? 'sha256:test' : args[0] === 'volume' ? 'pf-test_app_data' : '',
  stderr: '',
});
const dependencies: InstallationStartDependencies = {
  runDocker,
  composeUp: async () => ({ ok: true, log: 'private compose output', gatewaySkipped: false }),
  composePs: async () => ({
    running: true,
    services: [
      { name: 'app', service: 'app', state: 'running', health: 'healthy' },
      { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
      { name: 'proxy', service: 'proxy', state: 'exited', health: 'unhealthy' },
    ],
  }),
  inspectMaintenance: async () => ({ authenticated: true, settingsFormatVersion: 1 }),
  timeoutMs: 0,
};

test('database gate checks inventory before using a read-only networkless container', async () => {
  const calls: string[][] = [];
  const result = await inspectExistingAppDatabase('pf-test', appImage, async (args) => {
    calls.push(args);
    return runDocker(args);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], ['image', 'ls', '--quiet', appImage]);
  assert.deepEqual(calls[1], ['volume', 'ls', '--format', '{{.Name}}']);
  assert.ok(calls[2].includes('--pull=never'));
  assert.ok(calls[2].includes('--network'));
  assert.ok(calls[2].includes('none'));
  assert.ok(calls[2].includes('--read-only'));
  assert.ok(calls[2].includes('pf-test_app_data:/var/lib/praxis-flow/app:ro'));
});

test('missing image, volume or database aborts with a code before compose starts', async () => {
  for (const [command, code] of [
    ['image', 'app-image-missing'],
    ['volume', 'data-volume-missing'],
    ['run', 'database-missing'],
  ] as const) {
    const calls: string[] = [];
    const result = await startExistingInstallation(runOptions, appImage, {
      ...dependencies,
      runDocker: async (args) => {
        calls.push(args[0]);
        return args[0] === command
          ? { code: command === 'run' ? 42 : 0, stdout: '', stderr: '' }
          : runDocker(args);
      },
      composeUp: async () => assert.fail('must not start compose with missing substance'),
    });
    assert.deepEqual(result, { ok: false, code, compose: null, maintenanceAuthenticated: false });
    assert.equal(calls.at(-1), command);
  }
});

test('start classifies Compose, health and authentication failures without exposing logs', async () => {
  for (const [code, overrides] of [
    [
      'compose-start-failed',
      {
        composeUp: async () => ({ ok: false, log: 'private docker output', gatewaySkipped: false }),
      },
    ],
    ['health-timeout', { composePs: async () => ({ running: false, services: [] }) }],
    [
      'maintenance-auth-failed',
      { inspectMaintenance: async () => ({ authenticated: false, settingsFormatVersion: 1 }) },
    ],
  ] satisfies Array<[string, InstallationStartDependencies]>) {
    const result = await startExistingInstallation(runOptions, appImage, {
      ...dependencies,
      ...overrides,
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.code, code);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test('failed Docker queries or utility container execution never prove missing substance', async () => {
  for (const command of ['image', 'volume', 'run']) {
    await assert.rejects(
      startExistingInstallation(runOptions, appImage, {
        ...dependencies,
        runDocker: async (args) =>
          args[0] === command
            ? { code: 125, stdout: '', stderr: 'private diagnostic' }
            : runDocker(args),
        composeUp: async () => assert.fail('must not start after a failed inspection'),
      }),
      (error: unknown) => {
        assert.ok(error instanceof ManagerApiError);
        assert.equal(error.code, 'installation_inspection_failed');
        assert.doesNotMatch(JSON.stringify(error.toJSON()), /private/);
        assert.ok(error.cause);
        return true;
      },
    );
  }
});

test('start requires healthy core services and authenticated maintenance API', async () => {
  const result = await startExistingInstallation(runOptions, appImage, dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.maintenanceAuthenticated, true);
  assert.equal('log' in result, false);
});
