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
  restorePfbackup,
  mergeConfigRestoreEnv,
  mergeConfigRestoreManagerState,
  RESTORE_PHASES,
  type PfbackupRestoreDeps,
} from './settings-backup-restore.js';
import { packTlsSidecarArchive } from './tls-backup-sidecar.js';
import { GENERATED_CADDYFILE_MARKER, resolveProxyTlsPaths } from './proxy-tls.js';
import { testSetupContext } from './test-setup-context.js';

const HEALTHY_COMPOSE = {
  running: true,
  services: [
    { name: 'app', service: 'app', state: 'running', health: 'healthy' },
    { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
  ],
};

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

function buildArchiveContent(settings: Record<string, unknown> = sampleSettings) {
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
    composeStatus: async () => ({
      running: true,
      services: [
        { name: 'app', service: 'app', state: 'running', health: 'healthy' },
        { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
      ],
    }),
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
    composeStatus: async () => HEALTHY_COMPOSE,
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

test('restore without restricted state removes the current activation as one unit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-restricted-off-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  fs.appendFileSync(
    envPath,
    [
      'SETUP_RESTRICTED_ENABLED=true',
      'SETUP_RESTRICTED_APP_IP=10.20.0.2',
      'SETUP_RESTRICTED_INTERFACE_ID=mac:aa:00:00:00:00:07',
      'SETUP_RESTRICTED_WARNINGS_CONFIRMED=true',
      '',
    ].join('\n'),
  );
  try {
    const result = await restorePfbackup(
      buildArchiveContent(),
      testSetupContext(dir),
      {},
      workingRestoreDeps(appDataDir, {
        importSnapshot: async () => ({
          ok: true,
          routingMode: 'simple',
          portalEnabled: true,
          providerCredentialsSkipped: false,
          disabledProviderIds: [],
          errors: [],
        }),
      }),
    );

    assert.equal(result.ok, true);
    const restored = readEnvMap(envPath);
    assert.equal(restored.has('SETUP_RESTRICTED_ENABLED'), false);
    assert.equal(restored.has('SETUP_RESTRICTED_APP_IP'), false);
    assert.equal(restored.has('SETUP_RESTRICTED_INTERFACE_ID'), false);
    assert.equal(restored.has('SETUP_RESTRICTED_WARNINGS_CONFIRMED'), false);
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
    composeStatus: async () => HEALTHY_COMPOSE,
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
    composeStatus: async () => HEALTHY_COMPOSE,
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
    composeStatus: async () => HEALTHY_COMPOSE,
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
    composeStatus: async () => HEALTHY_COMPOSE,
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
    composeStatus: async () => HEALTHY_COMPOSE,
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
    composeStatus: async () => HEALTHY_COMPOSE,
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
    composeStatus: async () => HEALTHY_COMPOSE,
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
    composeStatus: async () => HEALTHY_COMPOSE,
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

function successfulRestoreDeps(appDataDir: string): PfbackupRestoreDeps {
  return workingRestoreDeps(appDataDir, {
    importSnapshot: async () => ({
      ok: true,
      routingMode: 'simple',
      portalEnabled: true,
      providerCredentialsSkipped: false,
      disabledProviderIds: [],
      errors: [],
    }),
  });
}

test('restorePfbackup unpacks sidecar bytes and does not accept a host path', async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-tls-src-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-tls-dst-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  const sidecarPath = path.join(source, 'sidecar.tgz');
  try {
    const destPaths = resolveProxyTlsPaths(dir);
    fs.mkdirSync(destPaths.caddyData, { recursive: true });
    fs.writeFileSync(path.join(destPaths.caddyData, 'stale.txt'), 'previous-host');
    const paths = resolveProxyTlsPaths(source);
    fs.mkdirSync(paths.caddyData, { recursive: true });
    fs.writeFileSync(path.join(paths.caddyData, 'marker.txt'), 'caddy-state');
    packTlsSidecarArchive({
      installHome: source,
      installationId: '7fk3m2q9',
      hostname: '7fk3m2.lan.notaus.de',
      destinationPath: sidecarPath,
    });
    const tlsSidecarBase64 = fs.readFileSync(sidecarPath).toString('base64');
    const settings = structuredClone(sampleSettings);
    settings.env = {
      ...settings.env,
      TLS_STATE: 'active',
      TLS_MODE: 'managed',
      TLS_CUTOVER_APPLIED: 'true',
      TLS_INSTALLATION_ID: '7fk3m2q9',
      TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
      PROXY_MODE: 'tls-managed',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    } as typeof settings.env;
    const result = await restorePfbackup(
      buildArchiveContent(settings),
      testSetupContext(dir),
      { tlsSidecarBase64 },
      successfulRestoreDeps(appDataDir),
    );
    assert.equal(result.ok, true);
    const env = readEnvMap(envPath);
    assert.equal(env.get('CANONICAL_BASE_URL'), 'https://7fk3m2.lan.notaus.de');
    assert.equal(env.get('TLS_INSTALLATION_ID'), '7fk3m2q9');
    const restored = resolveProxyTlsPaths(dir);
    assert.equal(
      fs.readFileSync(path.join(restored.caddyData, 'marker.txt'), 'utf8'),
      'caddy-state',
    );
    assert.equal(fs.existsSync(path.join(restored.caddyData, 'stale.txt')), false);
    const caddyfile = fs.readFileSync(restored.caddyfile, 'utf8');
    assert.match(caddyfile, new RegExp(GENERATED_CADDYFILE_MARKER));
    assert.match(caddyfile, /7fk3m2\.lan\.notaus\.de/);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup discards prepare-only TLS without sidecar and keeps HTTP', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-tls-prep-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  fs.appendFileSync(
    envPath,
    'TLS_STATE=preparing\nTLS_INSTALLATION_ID=old\nTLS_HOSTNAME=old.example\n',
  );
  const leftover = resolveProxyTlsPaths(dir);
  fs.mkdirSync(leftover.caddyData, { recursive: true });
  fs.writeFileSync(path.join(leftover.caddyData, 'stale.txt'), 'old-prep');
  const settings = structuredClone(sampleSettings);
  settings.env = {
    ...settings.env,
    TLS_STATE: 'awaiting-operator-dns',
    TLS_INSTALLATION_ID: '7fk3m2q9',
    TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
    PROXY_MODE: 'http',
    CANONICAL_BASE_URL: 'http://192.168.1.50:8080',
  } as typeof settings.env;
  try {
    const result = await restorePfbackup(
      buildArchiveContent(settings),
      testSetupContext(dir),
      {},
      successfulRestoreDeps(appDataDir),
    );
    assert.equal(result.ok, true);
    const env = readEnvMap(envPath);
    assert.equal(env.get('CANONICAL_BASE_URL'), 'http://192.168.1.50:8080');
    assert.equal(env.has('TLS_STATE'), false);
    assert.equal(env.has('TLS_INSTALLATION_ID'), false);
    assert.equal(fs.existsSync(resolveProxyTlsPaths(dir).root), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup does not create TLS dirs before rollback when stop fails', async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-tls-nostop-src-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-tls-nostop-dst-'));
  const { appDataDir } = seedInstallHome(dir);
  const sidecarPath = path.join(source, 'sidecar.tgz');
  try {
    const paths = resolveProxyTlsPaths(source);
    fs.mkdirSync(paths.caddyData, { recursive: true });
    fs.writeFileSync(path.join(paths.caddyData, 'marker.txt'), 'caddy-state');
    packTlsSidecarArchive({
      installHome: source,
      installationId: '7fk3m2q9',
      hostname: '7fk3m2.lan.notaus.de',
      destinationPath: sidecarPath,
    });
    const settings = structuredClone(sampleSettings);
    settings.env = {
      ...settings.env,
      TLS_STATE: 'active',
      TLS_MODE: 'managed',
      TLS_CUTOVER_APPLIED: 'true',
      TLS_INSTALLATION_ID: '7fk3m2q9',
      TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
      PROXY_MODE: 'tls-managed',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    } as typeof settings.env;
    const result = await restorePfbackup(
      buildArchiveContent(settings),
      testSetupContext(dir),
      { tlsSidecarBase64: fs.readFileSync(sidecarPath).toString('base64') },
      {
        ...successfulRestoreDeps(appDataDir),
        stopStack: async () => ({ ok: false, log: 'stop failed' }),
      },
    );
    assert.equal(result.ok, false);
    assert.equal(fs.existsSync(resolveProxyTlsPaths(dir).root), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup rejects active HTTPS without sidecar before writing env', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-tls-block-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  let stopped = false;
  const settings = structuredClone(sampleSettings);
  settings.env = {
    ...settings.env,
    TLS_STATE: 'active',
    TLS_INSTALLATION_ID: '7fk3m2q9',
    TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
    PROXY_MODE: 'tls-managed',
    CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
  } as typeof settings.env;
  try {
    const result = await restorePfbackup(
      buildArchiveContent(settings),
      testSetupContext(dir),
      {},
      {
        ...successfulRestoreDeps(appDataDir),
        stopStack: async () => {
          stopped = true;
          return { ok: true, log: 'stopped' };
        },
      },
    );
    assert.equal(result.ok, false);
    assert.equal(stopped, false);
    assert.match(result.ok ? '' : result.errors.join(' '), /Zertifikatsdatei fehlt/);
    assert.equal(readEnvMap(envPath).get('CANONICAL_BASE_URL'), 'http://192.168.1.10:8080');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup rolls TLS state back after sidecar unpack if cutover fails', async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-tls-rb-src-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-tls-rb-dst-'));
  const { appDataDir } = seedInstallHome(dir);
  const sidecarPath = path.join(source, 'sidecar.tgz');
  try {
    const destPaths = resolveProxyTlsPaths(dir);
    fs.mkdirSync(destPaths.caddyData, { recursive: true });
    fs.writeFileSync(path.join(destPaths.caddyData, 'current.txt'), 'host-before-restore');
    const paths = resolveProxyTlsPaths(source);
    fs.mkdirSync(paths.caddyData, { recursive: true });
    fs.writeFileSync(path.join(paths.caddyData, 'backup.txt'), 'from-backup');
    packTlsSidecarArchive({
      installHome: source,
      installationId: '7fk3m2q9',
      hostname: '7fk3m2.lan.notaus.de',
      destinationPath: sidecarPath,
    });
    const settings = structuredClone(sampleSettings);
    settings.env = {
      ...settings.env,
      TLS_STATE: 'active',
      TLS_MODE: 'managed',
      TLS_CUTOVER_APPLIED: 'true',
      TLS_INSTALLATION_ID: '7fk3m2q9',
      TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
      PROXY_MODE: 'tls-managed',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    } as typeof settings.env;
    const result = await restorePfbackup(
      buildArchiveContent(settings),
      testSetupContext(dir),
      { tlsSidecarBase64: fs.readFileSync(sidecarPath).toString('base64') },
      workingRestoreDeps(appDataDir, {
        importSnapshot: async () => ({ ok: false, errors: ['Import fehlgeschlagen.'] }),
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(
      fs.readFileSync(path.join(destPaths.caddyData, 'current.txt'), 'utf8'),
      'host-before-restore',
    );
    assert.equal(fs.existsSync(path.join(destPaths.caddyData, 'backup.txt')), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restorePfbackup rejects a non-local target Staff address before stopping the stack', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-staff-preflight-'));
  const { appDataDir } = seedInstallHome(dir);
  const content = buildArchiveContent({
    ...sampleSettings,
    env: {
      ...sampleSettings.env,
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      SETUP_LAN_APP_IP: '203.0.113.77',
      APP_BIND_ADDRESS: '127.0.0.1',
    } as Record<string, string>,
  });
  let stopCalls = 0;
  try {
    const result = await restorePfbackup(
      content,
      testSetupContext(dir),
      {},
      workingRestoreDeps(appDataDir, {
        stopStack: async () => {
          stopCalls += 1;
          return { ok: true, log: 'stopped' };
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, 'stop_stack');
      assert.match(result.errors.join(' '), /vor dem Stack-Stopp gesperrt/);
    }
    assert.equal(stopCalls, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const failure of [null, 'listener', 'bindings'] as const)
  test(`restricted restore audits the installed release contract: ${failure ?? 'success'}`, async () => {
    const { DEFAULT_PORTAL_PROXY_CONTRACT } = await import('@praxis-flow/server-shared');
    const { runtimeAuditEnv, runtimeAuditCompose, runtimeAuditInterfaces } =
      await import('./runtime-postcondition-test-fixtures.js');
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-audit-src-'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-audit-dst-'));
    try {
      const { envPath, appDataDir } = seedInstallHome(dir);
      const sidecarPath = path.join(source, 'sidecar.tgz');
      packTlsSidecarArchive({
        installHome: source,
        installationId: runtimeAuditEnv.TLS_INSTALLATION_ID,
        hostname: runtimeAuditEnv.TLS_HOSTNAME,
        staffHostname: runtimeAuditEnv.TLS_STAFF_HOSTNAME,
        portalHostname: runtimeAuditEnv.TLS_PORTAL_HOSTNAME,
        installationDomain: runtimeAuditEnv.TLS_INSTALLATION_DOMAIN,
        wildcardCertificateName: runtimeAuditEnv.TLS_WILDCARD_CERTIFICATE_NAME,
        destinationPath: sidecarPath,
      });
      const contract = structuredClone(DEFAULT_PORTAL_PROXY_CONTRACT);
      contract.api = [{ method: 'GET', path: '/api/v1/portal/installed-release' }];
      const tlsDir = path.join(dir, 'state/tls');
      fs.mkdirSync(tlsDir, { recursive: true });
      fs.writeFileSync(path.join(tlsDir, 'portal-contract.json'), JSON.stringify(contract));
      const settings = { ...sampleSettings, env: { ...sampleSettings.env, ...runtimeAuditEnv } };
      let listenerCalls = 0;
      let stops = 0;
      const observed: unknown[] = [];
      const result = await restorePfbackup(
        buildArchiveContent(settings),
        testSetupContext(dir),
        { tlsSidecarBase64: fs.readFileSync(sidecarPath).toString('base64') },
        {
          ...successfulRestoreDeps(appDataDir),
          networkInterfaces: runtimeAuditInterfaces,
          stopStack: async () => {
            stops++;
            return { ok: true, log: '' };
          },
          composeStatus: async () => {
            if (readEnvMap(envPath).get('SETUP_RESTRICTED_ENABLED') !== 'true')
              return HEALTHY_COMPOSE;
            const compose = runtimeAuditCompose();
            if (failure === 'bindings')
              compose.services[2]!.publishedBindings![0]!.hostIp = '0.0.0.0';
            return compose;
          },
          auditProxyContract: async (input) => {
            listenerCalls++;
            observed.push(input.contract);
            return failure === 'listener' ? 'wrong listener policy' : null;
          },
        },
      );
      assert.equal(result.ok, failure === null, JSON.stringify(result));
      assert.equal(listenerCalls, failure === 'bindings' ? 0 : 1);
      assert.deepEqual(observed, failure === 'bindings' ? [] : [contract]);
      assert.equal(stops, failure ? 2 : 1);
      if (!result.ok) {
        assert.equal(result.failedPhase, RESTORE_PHASES.healthCheck);
        assert.equal(result.rollbackSucceeded, true, JSON.stringify(result));
        assert.equal(readEnvMap(envPath).has('SETUP_RESTRICTED_ENABLED'), false);
      } else {
        assert.equal(readEnvMap(envPath).get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:current');
        assert.match(fs.readFileSync(path.join(tlsDir, 'Caddyfile'), 'utf8'), /installed-release/);
      }
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
