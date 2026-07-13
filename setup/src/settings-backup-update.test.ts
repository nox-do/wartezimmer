import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPfbackupArchive, serializePfbackupArchive } from '@praxis-flow/server-shared';
import { APP_DB_RELATED_FILES, createLocalAppDataAccess } from './app-data-volume.js';
import { readEnvMap } from './env-file.js';
import { readManagerState } from './manager-state.js';
import { buildTestPfupdateArchive } from './pfupdate-test-fixtures.js';
import { applyPfupdate, UPDATE_PHASES } from './settings-backup-update.js';
import type { SetupContext } from './setup-context.js';

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
  env: {
    BUSINESS_TZ: 'Europe/Berlin',
    PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:2026.07.1',
    PRAXIS_FLOW_SANDBOX_IMAGE: 'praxis-flow/sandbox:2026.07.1',
    PRAXIS_FLOW_GATEWAY_IMAGE: 'praxis-flow/gateway:2026.07.1',
  },
};

function testCtx(home: string): SetupContext {
  return {
    home,
    composeProjectName: 'pf-test',
    mode: 'install',
    templateRoot: home,
  };
}

function seedInstallHome(dir: string): { envPath: string; appDataDir: string; backupPath: string } {
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(
    envPath,
    [
      'BUSINESS_TZ=Europe/Berlin',
      'PRAXIS_FLOW_APP_IMAGE=praxis-flow/app:2026.07.1',
      'PRAXIS_FLOW_SANDBOX_IMAGE=praxis-flow/sandbox:2026.07.1',
      'PRAXIS_FLOW_GATEWAY_IMAGE=praxis-flow/gateway:2026.07.1',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'manager-state.json'),
    `${JSON.stringify(
      {
        release: {
          releaseVersion: '2026.07.1',
          appImage: 'praxis-flow/app:2026.07.1',
          sandboxImage: 'praxis-flow/sandbox:2026.07.1',
          gatewayImage: 'praxis-flow/gateway:2026.07.1',
          archiveSha256: null,
        },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(path.join(dir, 'docker-compose.delivery.yml'), 'services: { app: {} }\n');
  fs.writeFileSync(
    path.join(dir, 'docker-compose.gateway.delivery.yml'),
    'services: { gateway: {} }\n',
  );

  const appDataDir = path.join(dir, 'app-data');
  fs.mkdirSync(appDataDir, { recursive: true });
  for (const name of APP_DB_RELATED_FILES) {
    fs.writeFileSync(path.join(appDataDir, name), `seed-${name}`);
  }

  const backupPath = path.join(dir, 'backups', 'pre-update.pfbackup');
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(
    backupPath,
    serializePfbackupArchive(
      buildPfbackupArchive({
        settings: sampleSettings,
        managerState: {
          release: {
            releaseVersion: '2026.07.1',
            appImage: 'praxis-flow/app:2026.07.1',
            sandboxImage: 'praxis-flow/sandbox:2026.07.1',
            gatewayImage: 'praxis-flow/gateway:2026.07.1',
            archiveSha256: null,
          },
        },
      }),
    ),
    'utf8',
  );

  return { envPath, appDataDir, backupPath };
}

function mockDeps(appDataDir: string, backupPath: string) {
  return {
    createSettingsBackup: async () => ({ envPath: '', backupPath }),
    dockerLoad: async () => ({ ok: true, loaded: [], log: 'loaded' }),
    imageExists: async () => true,
    stopStack: async () => ({ ok: true, log: 'stopped' }),
    startAppStack: async () => ({ ok: true, log: 'app started', gatewaySkipped: false }),
    startFullStack: async () => ({ ok: true, log: 'full stack started', gatewaySkipped: false }),
    waitForMaintenanceApp: async () => true,
    validateSettings: async () => ({ ok: true, errors: [] }),
    importSnapshot: async () => ({
      ok: true,
      routingMode: 'simple',
      portalEnabled: true,
      providerCredentialsSkipped: false,
      disabledProviderIds: [],
      errors: [],
    }),
    exportDbSnapshot: async () => ({
      settingsFormatVersion: 1,
      exportedAt: sampleSettings.exportedAt,
      opsSettings: sampleSettings.opsSettings,
      authSettings: sampleSettings.authSettings,
      messagingProviderConfigs: sampleSettings.messagingProviderConfigs,
    }),
    composeStatus: async () => ({ running: true, services: [] }),
    runHealthChecks: async () => ({ ok: true, errors: [] }),
    appDataAccess: createLocalAppDataAccess(appDataDir),
  };
}

test('applyPfupdate succeeds and writes new image tags', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-apply-ok-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { envPath, appDataDir, backupPath } = seedInstallHome(dir);
  buildTestPfupdateArchive(archivePath, '2026.08.0');

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      mockDeps(appDataDir, backupPath),
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.report.previousVersion, '2026.07.1');
      assert.equal(result.report.targetVersion, '2026.08.0');
      assert.equal(result.report.backupPath, backupPath);
    }

    const env = readEnvMap(envPath);
    assert.equal(env.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:2026.08.0');
    assert.equal(env.get('PRAXIS_FLOW_SANDBOX_IMAGE'), 'praxis-flow/sandbox:2026.08.0');
    assert.equal(env.get('PRAXIS_FLOW_GATEWAY_IMAGE'), 'praxis-flow/gateway:2026.08.0');

    const manager = readManagerState(dir);
    assert.equal(manager.release?.releaseVersion, '2026.08.0');
    assert.equal(manager.release?.appImage, 'praxis-flow/app:2026.08.0');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate rolls back when import fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-apply-fail-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { envPath, appDataDir, backupPath } = seedInstallHome(dir);
  buildTestPfupdateArchive(archivePath, '2026.08.0');

  const deps = {
    ...mockDeps(appDataDir, backupPath),
    importSnapshot: async () => ({ ok: false, errors: ['import failed'] }),
  };

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      deps,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, UPDATE_PHASES.importSettings);
      assert.equal(result.rollbackAttempted, true);
      assert.equal(result.rollbackSucceeded, true);
    }

    const env = readEnvMap(envPath);
    assert.equal(env.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:2026.07.1');
    const manager = readManagerState(dir);
    assert.equal(manager.release?.releaseVersion, '2026.07.1');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate validates its backup before stopping the stack', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-prepare-backup-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { appDataDir, backupPath } = seedInstallHome(dir);
  buildTestPfupdateArchive(archivePath, '2026.08.0');
  let stopCalls = 0;

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      {
        ...mockDeps(appDataDir, backupPath),
        validateSettings: async () => ({ ok: false, errors: ['backup invalid'] }),
        stopStack: async () => {
          stopCalls += 1;
          return { ok: true, log: 'stopped' };
        },
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, UPDATE_PHASES.createSettingsBackup);
      assert.equal(result.rollbackAttempted, false);
    }
    assert.equal(stopCalls, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate rolls back when a cutover dependency throws', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-cutover-throw-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { envPath, appDataDir, backupPath } = seedInstallHome(dir);
  buildTestPfupdateArchive(archivePath, '2026.08.0');

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      {
        ...mockDeps(appDataDir, backupPath),
        startAppStack: async () => {
          throw new Error('start exploded');
        },
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, UPDATE_PHASES.cutover);
      assert.equal(result.rollbackAttempted, true);
      assert.equal(result.rollbackSucceeded, true);
      assert.match(result.errors.join(' '), /start exploded/);
    }
    assert.equal(readEnvMap(envPath).get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:2026.07.1');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate does not restore database files while rollback stop fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-rollback-stop-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { appDataDir, backupPath } = seedInstallHome(dir);
  buildTestPfupdateArchive(archivePath, '2026.08.0');
  const base = mockDeps(appDataDir, backupPath);
  let stopCalls = 0;
  let restoreCalls = 0;

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      {
        ...base,
        importSnapshot: async () => ({ ok: false, errors: ['import failed'] }),
        stopStack: async () => {
          stopCalls += 1;
          return stopCalls === 1
            ? { ok: true, log: 'stopped' }
            : { ok: false, log: 'rollback stop failed' };
        },
        appDataAccess: {
          ...base.appDataAccess,
          restoreDbFiles: async (sourceDir) => {
            restoreCalls += 1;
            await base.appDataAccess.restoreDbFiles(sourceDir);
          },
        },
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rollbackAttempted, true);
      assert.equal(result.rollbackSucceeded, false);
      assert.match(result.errors.join(' '), /rollback stop failed/);
    }
    assert.equal(restoreCalls, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate rejects invalid package before cutover', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-apply-invalid-'));
  const archivePath = path.join(dir, 'broken.pfupdate');
  const { appDataDir, backupPath } = seedInstallHome(dir);
  fs.writeFileSync(archivePath, 'not-a-tar');

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      mockDeps(appDataDir, backupPath),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rollbackAttempted, false);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate returns structured failure when archive disappears before staging', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-apply-missing-'));
  const archivePath = path.join(dir, 'vanished.pfupdate');
  const { appDataDir, backupPath } = seedInstallHome(dir);
  buildTestPfupdateArchive(archivePath, '2026.08.0');
  fs.unlinkSync(archivePath);

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      mockDeps(appDataDir, backupPath),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, UPDATE_PHASES.stagePackage);
      assert.equal(result.rollbackAttempted, false);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate returns validate_package for invalid manifest JSON', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-apply-bad-manifest-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { appDataDir, backupPath } = seedInstallHome(dir);
  buildTestPfupdateArchive(archivePath, { manifestContent: '{not-json' });

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      mockDeps(appDataDir, backupPath),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, UPDATE_PHASES.validatePackage);
      assert.equal(result.rollbackAttempted, false);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
