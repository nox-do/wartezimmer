import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { APP_DB_RELATED_FILES, createLocalAppDataAccess } from './app-data-volume.js';
import {
  FRESH_DB_CUTOVER_PHASES,
  runFreshDbSettingsCutover,
  type FreshDbCutoverDeps,
} from './fresh-db-settings-cutover.js';

const sampleSettings = {
  settingsFormatVersion: 1,
  exportedAt: '2026-07-12T12:00:00.000Z',
  opsSettings: { routingMode: 'simple', portalEnabled: true },
  authSettings: {
    staffPinHashMfa: 'a',
    staffPinHashOps: 'b',
    roomPanelPinHash: 'c',
  },
  messagingProviderConfigs: [],
};

function seedAppData(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of APP_DB_RELATED_FILES) {
    fs.writeFileSync(path.join(dir, name), `seed-${name}`);
  }
  return dir;
}

function baseDeps(
  appDataDir: string,
  overrides: Partial<FreshDbCutoverDeps> = {},
): FreshDbCutoverDeps {
  return {
    appDataAccess: createLocalAppDataAccess(appDataDir),
    startAppStack: async () => ({ ok: true, log: 'app started', gatewaySkipped: false }),
    startFullStack: async () => ({ ok: true, log: 'full stack started', gatewaySkipped: false }),
    waitForMaintenanceApp: async () => true,
    importSnapshot: async () => ({
      ok: true,
      routingMode: 'simple',
      portalEnabled: true,
      providerCredentialsSkipped: false,
      disabledProviderIds: [],
      errors: [],
    }),
    exportDbSnapshot: async () => ({
      settingsFormatVersion: sampleSettings.settingsFormatVersion,
      exportedAt: sampleSettings.exportedAt,
      opsSettings: sampleSettings.opsSettings,
      authSettings: sampleSettings.authSettings,
      messagingProviderConfigs: sampleSettings.messagingProviderConfigs,
    }),
    composeStatus: async () => ({
      running: true,
      services: [
        { name: 'app', service: 'app', state: 'running', health: 'healthy' },
        { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
      ],
    }),
    runHealthChecks: async () => ({ ok: true, errors: [] }),
    stackHealthWaitOptions: { timeoutMs: 0 },
    ...overrides,
  };
}

function cutoverInput(home: string, _appDataDir: string) {
  const rollbackDir = path.join(home, 'rollback', 'test-id');
  fs.mkdirSync(rollbackDir, { recursive: true });
  return {
    rollbackDir,
    dbAsideSubdir: 'pre-cutover-db',
    runOptions: {
      projectRoot: home,
      delivery: false,
      composeProjectName: 'pf-test',
    },
    envAfterWrite: new Map<string, string>([['SETUP_LAN_APP_IP', '192.168.1.10']]),
    importPayload: sampleSettings,
    localAppBaseUrl: 'http://127.0.0.1:8080',
    localMaintenanceAppBaseUrl: 'http://127.0.0.1:8082',
  };
}

test('runFreshDbSettingsCutover succeeds on happy path', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-ok-'));
  const appDataDir = seedAppData(path.join(dir, 'app-data'));

  try {
    const result = await runFreshDbSettingsCutover(
      cutoverInput(dir, appDataDir),
      baseDeps(appDataDir),
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.importResult.routingMode, 'simple');
      assert.equal(result.compose.running, true);
    }
    assert.ok(fs.existsSync(path.join(dir, 'rollback', 'test-id', 'pre-cutover-db')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runFreshDbSettingsCutover fails when import fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-import-'));
  const appDataDir = seedAppData(path.join(dir, 'app-data'));

  try {
    const result = await runFreshDbSettingsCutover(
      cutoverInput(dir, appDataDir),
      baseDeps(appDataDir, {
        importSnapshot: async () => ({ ok: false, errors: ['Import rejected.'] }),
      }),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, FRESH_DB_CUTOVER_PHASES.importSnapshot);
      assert.deepEqual(result.errors, ['Import rejected.']);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runFreshDbSettingsCutover fails when re-export drifts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-verify-'));
  const appDataDir = seedAppData(path.join(dir, 'app-data'));

  try {
    const result = await runFreshDbSettingsCutover(
      cutoverInput(dir, appDataDir),
      baseDeps(appDataDir, {
        exportDbSnapshot: async () => ({
          settingsFormatVersion: 1,
          exportedAt: sampleSettings.exportedAt,
          opsSettings: { routingMode: 'advanced' },
          authSettings: sampleSettings.authSettings,
          messagingProviderConfigs: sampleSettings.messagingProviderConfigs,
        }),
      }),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, FRESH_DB_CUTOVER_PHASES.verifyExport);
      assert.match(result.errors[0] ?? '', /weicht vom importierten Backup ab/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runFreshDbSettingsCutover fails when health check fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-health-'));
  const appDataDir = seedAppData(path.join(dir, 'app-data'));

  try {
    const result = await runFreshDbSettingsCutover(
      cutoverInput(dir, appDataDir),
      baseDeps(appDataDir, {
        runHealthChecks: async () => ({ ok: false, errors: ['Probe failed.'] }),
      }),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, FRESH_DB_CUTOVER_PHASES.healthCheck);
      assert.deepEqual(result.errors, ['Probe failed.']);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runFreshDbSettingsCutover fails when Docker health is bad despite green probes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-docker-health-'));
  const appDataDir = seedAppData(path.join(dir, 'app-data'));
  try {
    const result = await runFreshDbSettingsCutover(
      cutoverInput(dir, appDataDir),
      baseDeps(appDataDir, {
        composeStatus: async () => ({
          running: true,
          services: [
            { name: 'app', service: 'app', state: 'running', health: 'healthy' },
            { name: 'sandbox', service: 'sandbox', state: 'running', health: 'unhealthy' },
          ],
        }),
        runHealthChecks: async () => ({ ok: true, errors: [] }),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failedPhase, FRESH_DB_CUTOVER_PHASES.healthCheck);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runFreshDbSettingsCutover waits while Docker health is starting', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-starting-'));
  const appDataDir = seedAppData(path.join(dir, 'app-data'));
  let polls = 0;
  try {
    const result = await runFreshDbSettingsCutover(
      cutoverInput(dir, appDataDir),
      baseDeps(appDataDir, {
        composeStatus: async () => {
          polls += 1;
          return {
            running: true,
            services: [
              { name: 'app', service: 'app', state: 'running', health: 'healthy' },
              {
                name: 'sandbox',
                service: 'sandbox',
                state: 'running',
                health: polls === 1 ? 'starting' : 'healthy',
              },
            ],
          };
        },
        stackHealthWaitOptions: { timeoutMs: 10, intervalMs: 1, sleep: async () => {} },
      }),
    );
    assert.equal(result.ok, true);
    assert.equal(polls, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runFreshDbSettingsCutover uses prepareImport hook after maintenance is ready', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-prepare-'));
  const appDataDir = seedAppData(path.join(dir, 'app-data'));
  let maintenanceReady = false;

  try {
    const result = await runFreshDbSettingsCutover(
      {
        ...cutoverInput(dir, appDataDir),
        importPayload: undefined,
        prepareImport: async () => {
          assert.equal(maintenanceReady, true);
          return { ok: true, importPayload: sampleSettings };
        },
      },
      baseDeps(appDataDir, {
        waitForMaintenanceApp: async () => {
          maintenanceReady = true;
          return true;
        },
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(maintenanceReady, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runFreshDbSettingsCutover copies device authorizations only when hook is set', async () => {
  const withDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-copy-'));
  const withoutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-nocopy-'));
  const withAppData = seedAppData(path.join(withDir, 'app-data'));
  const withoutAppData = seedAppData(path.join(withoutDir, 'app-data'));
  const copied: string[] = [];

  try {
    const withCopy = await runFreshDbSettingsCutover(
      {
        ...cutoverInput(withDir, withAppData),
        copyDeviceAuthorizations: async (asideDir) => {
          copied.push(asideDir);
          return { ok: true, imported: 0 };
        },
      },
      baseDeps(withAppData),
    );
    assert.equal(withCopy.ok, true);
    assert.equal(copied.length, 1);
    assert.match(copied[0] ?? '', /pre-cutover-db$/);

    const withoutCopy = await runFreshDbSettingsCutover(
      cutoverInput(withoutDir, withoutAppData),
      baseDeps(withoutAppData),
    );
    assert.equal(withoutCopy.ok, true);
    assert.equal(copied.length, 1);
  } finally {
    fs.rmSync(withDir, { recursive: true, force: true });
    fs.rmSync(withoutDir, { recursive: true, force: true });
  }
});

test('runFreshDbSettingsCutover fails when device authorization copy fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-db-cutover-copy-fail-'));
  const appDataDir = seedAppData(path.join(dir, 'app-data'));

  try {
    const result = await runFreshDbSettingsCutover(
      {
        ...cutoverInput(dir, appDataDir),
        copyDeviceAuthorizations: async () => ({ ok: false, errors: ['copy failed'] }),
      },
      baseDeps(appDataDir),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, FRESH_DB_CUTOVER_PHASES.copyDeviceAuthorizations);
      assert.deepEqual(result.errors, ['copy failed']);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
