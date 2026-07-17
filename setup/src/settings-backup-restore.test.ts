import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPfbackupArchive, serializePfbackupArchive } from '@praxis-flow/server-shared';
import { APP_DB_RELATED_FILES, createLocalAppDataAccess } from './app-data-volume.js';
import { readEnvMap, writeEnvRecordAtomically } from './env-file.js';
import { readManagerState } from './manager-state.js';
import {
  RESTORE_PHASES,
  mergeConfigRestoreEnv,
  mergeConfigRestoreManagerState,
  restorePfbackup,
  type PfbackupRestoreDeps,
} from './settings-backup-restore.js';
import { testSetupContext } from './test-setup-context.js';

const sampleSettings = {
  settingsFormatVersion: 1,
  exportedAt: '2026-07-12T12:00:00.000Z',
  opsSettings: {
    routingMode: 'simple',
    returnWindowMinutes: 15,
    practiceOpenFrom: '08:00',
    practiceOpenTo: '17:00',
    practiceProfileJson: '{}',
    topics: [{ topicId: 'blut', label: 'Blut', enabled: true, sortOrder: 1 }],
    journeySettings: { templates: [], assignments: [] },
    rooms: [
      {
        roomId: 'mfa-tresen',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
      },
    ],
    contactLookupFolderPath: '/tmp/contact-lookup',
    contactLookupDelimiterMode: 'auto',
    contactLookupHasHeader: true,
    contactLookupMappingJson: '{}',
    emergencyEnabled: false,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: true,
    terminalAuthNameDobEnabled: true,
    terminalAuthEgkEnabled: false,
    terminalPatientLocales: [],
    smsProvider: 'mock',
    exportBasePath: '/tmp/exports',
    portalEnabled: true,
    setupCompletedAt: null,
    setupContactMode: 'unset',
  },
  authSettings: {
    staffPinHashMfa: 'a',
    staffPinHashOps: 'b',
    roomPanelPinHash: 'c',
  },
  messagingProviderConfigs: [
    {
      providerId: 'seven',
      channel: 'sms',
      enabled: true,
      credentialsJson: '{"apiKey":"secret"}',
    },
  ],
  env: {
    BUSINESS_TZ: 'Europe/Berlin',
    SETUP_LAN_APP_IP: '192.168.1.50',
    CANONICAL_BASE_URL: 'http://192.168.1.50:8080',
    IMPORTS_HOST_PATH: '/data/imports',
    EXPORTS_HOST_PATH: '/data/exports',
    PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:backup',
    PRAXIS_FLOW_SANDBOX_IMAGE: 'praxis-flow/sandbox:backup',
    PRAXIS_FLOW_GATEWAY_IMAGE: 'praxis-flow/gateway:backup',
  },
};

const backupManagerState = {
  release: {
    releaseVersion: '2026.06.1',
    appImage: 'praxis-flow/app:backup',
    sandboxImage: 'praxis-flow/sandbox:backup',
    gatewayImage: 'praxis-flow/gateway:backup',
    archiveSha256: null,
  },
};

const currentManagerState = {
  release: {
    releaseVersion: '2026.07.1',
    appImage: 'praxis-flow/app:current',
    sandboxImage: 'praxis-flow/sandbox:current',
    gatewayImage: 'praxis-flow/gateway:current',
    archiveSha256: 'abc',
  },
};

function buildArchiveContent(settings = sampleSettings) {
  return serializePfbackupArchive(
    buildPfbackupArchive({
      settings,
      managerState: backupManagerState,
      createdAt: '2026-07-12T10:00:00.000Z',
    }),
  );
}

function seedInstallHome(dir: string): { envPath: string; appDataDir: string } {
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(
    envPath,
    [
      'BUSINESS_TZ=Europe/Berlin',
      'SETUP_LAN_APP_IP=192.168.1.10',
      'CANONICAL_BASE_URL=http://192.168.1.10:8080',
      'IMPORTS_HOST_PATH=/old/imports',
      'EXPORTS_HOST_PATH=/old/exports',
      'PRAXIS_FLOW_APP_IMAGE=praxis-flow/app:current',
      'PRAXIS_FLOW_SANDBOX_IMAGE=praxis-flow/sandbox:current',
      'PRAXIS_FLOW_GATEWAY_IMAGE=praxis-flow/gateway:current',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'manager-state.json'),
    `${JSON.stringify(currentManagerState, null, 2)}\n`,
  );
  const appDataDir = path.join(dir, 'app-data');
  fs.mkdirSync(appDataDir, { recursive: true });
  for (const name of APP_DB_RELATED_FILES) {
    fs.writeFileSync(path.join(appDataDir, name), `seed-${name}`);
  }
  return { envPath, appDataDir };
}

function workingRestoreDeps(
  appDataDir: string,
  overrides: Partial<PfbackupRestoreDeps> = {},
): PfbackupRestoreDeps {
  return {
    stopStack: async () => ({ ok: true, log: 'stopped' }),
    startAppStack: async () => ({ ok: true, log: 'app started', gatewaySkipped: false }),
    startFullStack: async () => ({ ok: true, log: 'full stack started', gatewaySkipped: false }),
    waitForMaintenanceApp: async () => true,
    validateSettings: async () => ({ ok: true, errors: [] }),
    importSnapshot: async () => ({ ok: false, errors: ['Import fehlgeschlagen.'] }),
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
    ...overrides,
  };
}

test('mergeConfigRestoreEnv keeps current stack image tags', () => {
  const merged = mergeConfigRestoreEnv(sampleSettings.env, {
    PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:current',
    PRAXIS_FLOW_SANDBOX_IMAGE: 'praxis-flow/sandbox:current',
    PRAXIS_FLOW_GATEWAY_IMAGE: 'praxis-flow/gateway:current',
    PRAXIS_FLOW_PROXY_IMAGE: 'caddy:2.11.4',
  });
  assert.equal(merged.PRAXIS_FLOW_APP_IMAGE, 'praxis-flow/app:current');
  assert.equal(merged.PRAXIS_FLOW_PROXY_IMAGE, 'caddy:2.11.4');
  assert.equal(merged.IMPORTS_HOST_PATH, '/data/imports');
});

test('mergeConfigRestoreManagerState keeps current release images', () => {
  const merged = mergeConfigRestoreManagerState(backupManagerState, currentManagerState);
  assert.equal(merged.release?.appImage, 'praxis-flow/app:current');
  assert.equal(merged.release?.releaseVersion, '2026.07.1');
});

test('restorePfbackup rejects invalid archive without side effects', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-invalid-'));
  const { appDataDir } = seedInstallHome(dir);
  try {
    const result = await restorePfbackup(
      '{not-json',
      testSetupContext(dir),
      {},
      { appDataAccess: createLocalAppDataAccess(appDataDir) },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, RESTORE_PHASES.validateArchive);
      assert.equal(result.rollbackAttempted, false);
    }
    assert.equal(readEnvMap(path.join(dir, '.env')).get('IMPORTS_HOST_PATH'), '/old/imports');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup succeeds and preserves current image tags in .env', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-ok-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  const deps = {
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

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps);
    assert.equal(result.ok, true);
    const env = readEnvMap(envPath);
    assert.equal(env.get('IMPORTS_HOST_PATH'), '/data/imports');
    assert.equal(env.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:current');
    const manager = readManagerState(dir);
    assert.equal(manager.release?.appImage, 'praxis-flow/app:current');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup passes skipProviderCredentials to import', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-skip-'));
  const { appDataDir } = seedInstallHome(dir);
  let importSkip = false;
  const deps = {
    stopStack: async () => ({ ok: true, log: 'stopped' }),
    startAppStack: async () => ({ ok: true, log: 'app started', gatewaySkipped: false }),
    startFullStack: async () => ({ ok: true, log: 'full stack started', gatewaySkipped: false }),
    waitForMaintenanceApp: async () => true,
    validateSettings: async () => ({ ok: true, errors: [] }),
    importSnapshot: async (_snapshot: unknown, options?: { skipProviderCredentials?: boolean }) => {
      importSkip = options?.skipProviderCredentials === true;
      return {
        ok: true,
        routingMode: 'simple',
        portalEnabled: true,
        providerCredentialsSkipped: true,
        disabledProviderIds: ['seven'],
        errors: [],
      };
    },
    exportDbSnapshot: async () => ({
      settingsFormatVersion: 1,
      exportedAt: sampleSettings.exportedAt,
      opsSettings: sampleSettings.opsSettings,
      authSettings: sampleSettings.authSettings,
      messagingProviderConfigs: [
        {
          providerId: 'seven',
          channel: 'sms',
          enabled: false,
          credentialsJson: '{}',
        },
      ],
    }),
    composeStatus: async () => ({ running: true, services: [] }),
    runHealthChecks: async () => ({ ok: true, errors: [] }),
    appDataAccess: createLocalAppDataAccess(appDataDir),
  };

  try {
    const result = await restorePfbackup(
      buildArchiveContent(),
      testSetupContext(dir),
      { skipProviderCredentials: true },
      deps,
    );
    assert.equal(result.ok, true);
    assert.equal(importSkip, true);
    if (result.ok) {
      assert.equal(result.report.providerCredentialsSkipped, true);
      assert.deepEqual(result.report.disabledProviderIds, ['seven']);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup rolls back after import failure', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-import-fail-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  const deps = {
    stopStack: async () => ({ ok: true, log: 'stopped' }),
    startAppStack: async () => ({ ok: true, log: 'app started', gatewaySkipped: false }),
    startFullStack: async () => ({ ok: true, log: 'full stack started', gatewaySkipped: false }),
    waitForMaintenanceApp: async () => true,
    validateSettings: async () => ({ ok: true, errors: [] }),
    importSnapshot: async () => ({ ok: false, errors: ['Import fehlgeschlagen.'] }),
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

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, RESTORE_PHASES.importSnapshot);
      assert.equal(result.rollbackAttempted, true);
      assert.equal(result.rollbackSucceeded, true);
    }
    assert.equal(readEnvMap(envPath).get('IMPORTS_HOST_PATH'), '/old/imports');
    assert.equal(fs.existsSync(path.join(appDataDir, 'praxis-flow.db')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup fails write_env and rolls back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-env-fail-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  const deps = {
    stopStack: async () => ({ ok: true, log: 'stopped' }),
    startAppStack: async () => ({ ok: true, log: 'app started', gatewaySkipped: false }),
    startFullStack: async () => ({ ok: true, log: 'full stack started', gatewaySkipped: false }),
    waitForMaintenanceApp: async () => true,
    validateSettings: async () => ({ ok: true, errors: [] }),
    importSnapshot: async () => ({ ok: true, errors: [] }),
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

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps, {
      failWriteEnv: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, RESTORE_PHASES.writeEnv);
      assert.equal(result.rollbackSucceeded, true);
    }
    assert.equal(readEnvMap(envPath).get('IMPORTS_HOST_PATH'), '/old/imports');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup fails start_app and rolls back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-start-fail-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  const deps = {
    stopStack: async () => ({ ok: true, log: 'stopped' }),
    startAppStack: async () => ({ ok: true, log: 'app started', gatewaySkipped: false }),
    startFullStack: async () => ({ ok: true, log: 'full stack started', gatewaySkipped: false }),
    waitForMaintenanceApp: async () => true,
    validateSettings: async () => ({ ok: true, errors: [] }),
    importSnapshot: async () => ({ ok: true, errors: [] }),
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

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps, {
      failStartApp: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, RESTORE_PHASES.startApp);
      assert.equal(result.rollbackSucceeded, true);
    }
    assert.equal(readEnvMap(envPath).get('IMPORTS_HOST_PATH'), '/old/imports');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup fails verify_export and rolls back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-verify-fail-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  const deps = {
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
      opsSettings: { ...sampleSettings.opsSettings, routingMode: 'complex' },
      authSettings: sampleSettings.authSettings,
      messagingProviderConfigs: sampleSettings.messagingProviderConfigs,
    }),
    composeStatus: async () => ({ running: true, services: [] }),
    runHealthChecks: async () => ({ ok: true, errors: [] }),
    appDataAccess: createLocalAppDataAccess(appDataDir),
  };

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, RESTORE_PHASES.verifyExport);
      assert.equal(result.rollbackSucceeded, true);
    }
    assert.equal(readEnvMap(envPath).get('IMPORTS_HOST_PATH'), '/old/imports');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup backs up db wal and shm into rollback directory', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-db-backup-'));
  const { appDataDir } = seedInstallHome(dir);
  let capturedRollbackDir = '';
  const deps = {
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

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps, {
      afterBackupRollbackState: async () => {
        const rollbackRoot = path.join(dir, 'rollback');
        const [restoreId] = fs.readdirSync(rollbackRoot);
        capturedRollbackDir = path.join(rollbackRoot, restoreId, 'app-data');
      },
    });
    assert.equal(result.ok, true);
    for (const name of APP_DB_RELATED_FILES) {
      assert.equal(fs.existsSync(path.join(capturedRollbackDir, name)), true);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore env write keeps current-only keys while applying backup values and image tags', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-env-merge-'));
  const envPath = path.join(dir, '.env');
  try {
    fs.writeFileSync(
      envPath,
      [
        'IMPORTS_HOST_PATH=/old/imports',
        'NEW_FEATURE_FLAG=1',
        'PRAXIS_FLOW_APP_IMAGE=praxis-flow/app:current',
        '',
      ].join('\n'),
    );
    const merged = mergeConfigRestoreEnv(sampleSettings.env, {
      IMPORTS_HOST_PATH: '/old/imports',
      NEW_FEATURE_FLAG: '1',
      PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:current',
    });
    writeEnvRecordAtomically(envPath, merged);
    const env = readEnvMap(envPath);
    assert.equal(env.get('IMPORTS_HOST_PATH'), '/data/imports');
    assert.equal(env.get('NEW_FEATURE_FLAG'), '1');
    assert.equal(env.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:current');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup stops stack before backing up runtime db files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-stop-order-'));
  const { appDataDir } = seedInstallHome(dir);
  const callOrder: string[] = [];
  const localAccess = createLocalAppDataAccess(appDataDir);
  const deps = {
    stopStack: async () => {
      callOrder.push('stopStack');
      return { ok: true, log: 'stopped' };
    },
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
    appDataAccess: {
      ...localAccess,
      backupDbFiles: async (targetDir: string) => {
        callOrder.push('backupDbFiles');
        return localAccess.backupDbFiles(targetDir);
      },
    },
  };

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps);
    assert.equal(result.ok, true);
    assert.ok(callOrder.indexOf('stopStack') < callOrder.indexOf('backupDbFiles'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup rolls back when a cutover dependency throws', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-cutover-throw-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  const deps = workingRestoreDeps(appDataDir, {
    startAppStack: async () => {
      throw new Error('Docker-Aufruf abgebrochen.');
    },
  });

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, RESTORE_PHASES.cutover);
      assert.equal(result.rollbackAttempted, true);
      assert.equal(result.rollbackSucceeded, true);
      assert.ok(result.errors.some((error) => error.includes('Docker-Aufruf abgebrochen.')));
    }
    assert.equal(readEnvMap(envPath).get('IMPORTS_HOST_PATH'), '/old/imports');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup does not restore database files while rollback stop fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-rollback-stop-'));
  const { appDataDir } = seedInstallHome(dir);
  const localAccess = createLocalAppDataAccess(appDataDir);
  let stopCalls = 0;
  let restoreCalls = 0;
  const deps = workingRestoreDeps(appDataDir, {
    stopStack: async () => {
      stopCalls += 1;
      return stopCalls === 1
        ? { ok: true, log: 'stopped' }
        : { ok: false, log: 'Rollback-Stop fehlgeschlagen.' };
    },
    appDataAccess: {
      ...localAccess,
      restoreDbFiles: async (sourceDir) => {
        restoreCalls += 1;
        return localAccess.restoreDbFiles(sourceDir);
      },
    },
  });

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rollbackAttempted, true);
      assert.equal(result.rollbackSucceeded, false);
      assert.ok(result.errors.some((error) => error.includes('Rollback-Stop fehlgeschlagen.')));
    }
    assert.equal(restoreCalls, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup surfaces rollback errors in failure response', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-rollback-errors-'));
  const { appDataDir } = seedInstallHome(dir);
  const deps = {
    stopStack: async () => ({ ok: true, log: 'stopped' }),
    startAppStack: async () => ({ ok: true, log: 'app started', gatewaySkipped: false }),
    startFullStack: async () => ({ ok: true, log: 'full stack started', gatewaySkipped: false }),
    waitForMaintenanceApp: async () => true,
    validateSettings: async () => ({ ok: true, errors: [] }),
    importSnapshot: async () => ({ ok: false, errors: ['Import fehlgeschlagen.'] }),
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

  try {
    const result = await restorePfbackup(buildArchiveContent(), testSetupContext(dir), {}, deps, {
      failRollback: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rollbackAttempted, true);
      assert.equal(result.rollbackSucceeded, false);
      assert.ok(result.errors.some((error) => error.includes('Import fehlgeschlagen.')));
      assert.ok(result.errors.some((error) => error.startsWith('Rollback:')));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeConfigRestoreManagerState unit', () => {
  assert.deepEqual(
    mergeConfigRestoreManagerState({ release: null }, currentManagerState),
    currentManagerState,
  );
});
