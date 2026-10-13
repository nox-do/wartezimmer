import { recoverRestoreOperation } from './settings-backup-restore.js';
import {
  readRestoreOperation,
  readRestoreOperationStatus,
  writeRestoreOperation,
  restoreOperationPath,
  restoreRollbackDirectory,
  type RestoreOperation,
} from './restore-operation.js';
import { captureMaintenanceRollback } from './maintenance-rollback.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPfbackupArchive, serializePfbackupArchive } from '@wartezimmer/server-shared';
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
import { testSetupContext } from './test-helpers/test-setup-context.js';

const HEALTHY_COMPOSE = {
  running: true,
  services: [
    { name: 'app', service: 'app', state: 'running', health: 'healthy' },
    { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
  ],
};

function healthyProxyCompose(https: boolean) {
  return {
    running: true,
    services: [
      {
        name: 'app',
        service: 'app',
        state: 'running',
        health: 'healthy',
        publishedBindings: [
          { hostIp: '127.0.0.1', publishedPort: 8080, targetPort: 8080, protocol: 'tcp' },
          { hostIp: '127.0.0.1', publishedPort: 8082, targetPort: 8082, protocol: 'tcp' },
        ],
      },
      {
        name: 'sandbox',
        service: 'sandbox',
        state: 'running',
        health: 'healthy',
        publishedBindings: [],
      },
      {
        name: 'proxy',
        service: 'proxy',
        state: 'running',
        health: 'healthy',
        publishedBindings: [
          { hostIp: '192.168.1.50', publishedPort: 80, targetPort: 80, protocol: 'tcp' },
          ...(https
            ? [
                {
                  hostIp: '192.168.1.50',
                  publishedPort: 443,
                  targetPort: 443,
                  protocol: 'tcp',
                },
              ]
            : []),
        ],
      },
    ],
  };
}

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
    WARTEZIMMER_APP_IMAGE: 'wartezimmer/app:backup',
    WARTEZIMMER_SANDBOX_IMAGE: 'wartezimmer/sandbox:backup',
    WARTEZIMMER_GATEWAY_IMAGE: 'wartezimmer/gateway:backup',
  },
};

const backupManagerState = {
  release: {
    releaseVersion: '2026.06.1',
    appImage: 'wartezimmer/app:backup',
    sandboxImage: 'wartezimmer/sandbox:backup',
    gatewayImage: 'wartezimmer/gateway:backup',
    archiveSha256: null,
  },
};

const currentManagerState = {
  release: {
    releaseVersion: '2026.07.1',
    appImage: 'wartezimmer/app:current',
    sandboxImage: 'wartezimmer/sandbox:current',
    gatewayImage: 'wartezimmer/gateway:current',
    archiveSha256: 'abc',
  },
};

function buildArchiveContent(
  settings: Record<string, unknown> = sampleSettings,
  tlsArchiveBase64?: string,
) {
  return serializePfbackupArchive(
    buildPfbackupArchive({
      settings,
      managerState: backupManagerState,
      tlsArchiveBase64,
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
      'WARTEZIMMER_APP_IMAGE=wartezimmer/app:current',
      'WARTEZIMMER_SANDBOX_IMAGE=wartezimmer/sandbox:current',
      'WARTEZIMMER_GATEWAY_IMAGE=wartezimmer/gateway:current',
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
    WARTEZIMMER_APP_IMAGE: 'wartezimmer/app:current',
    WARTEZIMMER_SANDBOX_IMAGE: 'wartezimmer/sandbox:current',
    WARTEZIMMER_GATEWAY_IMAGE: 'wartezimmer/gateway:current',
    WARTEZIMMER_PROXY_IMAGE: 'caddy:2.11.4',
  });
  assert.equal(merged.WARTEZIMMER_APP_IMAGE, 'wartezimmer/app:current');
  assert.equal(merged.WARTEZIMMER_PROXY_IMAGE, 'caddy:2.11.4');
  assert.equal(merged.IMPORTS_HOST_PATH, '/data/imports');
});

test('mergeConfigRestoreEnv materializes current-only keys into the target', () => {
  const merged = mergeConfigRestoreEnv(
    { SETUP_LAN_APP_IP: '192.168.1.20' },
    { PROXY_ENABLED: 'true', PROXY_MODE: 'off', CURRENT_ONLY: 'kept' },
  );
  assert.equal(merged.PROXY_ENABLED, 'true');
  assert.equal(merged.PROXY_MODE, 'off');
  assert.equal(merged.CURRENT_ONLY, 'kept');
});

test('restore validates the fully merged target before stopping the stack', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-target-'));
  const { envPath, appDataDir } = seedInstallHome(dir);
  let stopCalls = 0;
  try {
    fs.appendFileSync(envPath, 'PROXY_ENABLED=true\nPROXY_MODE=off\n');
    const result = await restorePfbackup(
      buildArchiveContent(),
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
    assert.equal(stopCalls, 0);
    assert.equal(readEnvMap(envPath).get('PROXY_MODE'), 'off');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore rejects an incomplete backup proxy contract instead of normalizing it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-proxy-contract-'));
  const { appDataDir } = seedInstallHome(dir);
  let stopCalls = 0;
  try {
    const settings = structuredClone(sampleSettings);
    settings.env = { ...settings.env, PROXY_MODE: 'http' } as typeof settings.env;
    const result = await restorePfbackup(
      buildArchiveContent(settings),
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
    assert.equal(stopCalls, 0);
    if (!result.ok) assert.match(result.errors.join(' '), /PROXY_ENABLED=true fehlt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeConfigRestoreManagerState keeps current release images', () => {
  const merged = mergeConfigRestoreManagerState(backupManagerState, currentManagerState);
  assert.equal(merged.release?.appImage, 'wartezimmer/app:current');
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
    assert.equal(env.get('WARTEZIMMER_APP_IMAGE'), 'wartezimmer/app:current');
    const manager = readManagerState(dir);
    assert.equal(manager.release?.appImage, 'wartezimmer/app:current');
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
    assert.equal(fs.existsSync(path.join(appDataDir, 'wartezimmer.db')), true);
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
        assert.equal(readRestoreOperation(dir)?.phase, 'rollback-ready');
        const rollbackRoot = path.join(dir, 'rollback/restore');
        const [restoreId] = fs.readdirSync(rollbackRoot);
        capturedRollbackDir = path.join(rollbackRoot, restoreId, 'app-data');
        for (const name of APP_DB_RELATED_FILES)
          assert.equal(fs.existsSync(path.join(capturedRollbackDir, name)), true);
      },
    });
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(capturedRollbackDir), false);
    assert.equal(readRestoreOperation(dir), null);
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
        'WARTEZIMMER_APP_IMAGE=wartezimmer/app:current',
        '',
      ].join('\n'),
    );
    const merged = mergeConfigRestoreEnv(sampleSettings.env, {
      IMPORTS_HOST_PATH: '/old/imports',
      NEW_FEATURE_FLAG: '1',
      WARTEZIMMER_APP_IMAGE: 'wartezimmer/app:current',
    });
    writeEnvRecordAtomically(envPath, merged);
    const env = readEnvMap(envPath);
    assert.equal(env.get('IMPORTS_HOST_PATH'), '/data/imports');
    assert.equal(env.get('NEW_FEATURE_FLAG'), '1');
    assert.equal(env.get('WARTEZIMMER_APP_IMAGE'), 'wartezimmer/app:current');
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

function successfulRestoreDeps(appDataDir: string, proxyHttps?: boolean): PfbackupRestoreDeps {
  return workingRestoreDeps(appDataDir, {
    networkInterfaces: () => [
      {
        name: 'staff',
        addresses: [{ address: '192.168.1.50', family: 'IPv4', internal: false }],
      },
    ],
    ...(proxyHttps === undefined
      ? {}
      : { composeStatus: async () => healthyProxyCompose(proxyHttps) }),
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
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'tls-managed',
      APP_BIND_ADDRESS: '127.0.0.1',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    } as typeof settings.env;
    const result = await restorePfbackup(
      buildArchiveContent(settings, tlsSidecarBase64),
      testSetupContext(dir),
      {},
      successfulRestoreDeps(appDataDir, true),
    );
    assert.equal(result.ok, true, result.ok ? undefined : result.errors.join(' '));
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
    TLS_MODE: 'managed',
    PROXY_ENABLED: 'true',
    PROXY_MODE: 'http',
    APP_BIND_ADDRESS: '127.0.0.1',
    CANONICAL_BASE_URL: 'http://192.168.1.50:8080',
  } as typeof settings.env;
  try {
    const result = await restorePfbackup(
      buildArchiveContent(settings),
      testSetupContext(dir),
      {},
      successfulRestoreDeps(appDataDir, false),
    );
    assert.equal(result.ok, true, result.ok ? undefined : result.errors.join(' '));
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
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'tls-managed',
      APP_BIND_ADDRESS: '127.0.0.1',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    } as typeof settings.env;
    const result = await restorePfbackup(
      buildArchiveContent(settings, fs.readFileSync(sidecarPath).toString('base64')),
      testSetupContext(dir),
      {},
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
    PROXY_ENABLED: 'true',
    PROXY_MODE: 'tls-managed',
    APP_BIND_ADDRESS: '127.0.0.1',
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
    assert.match(result.ok ? '' : result.errors.join(' '), /HTTPS-Daten fehlen/);
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
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'tls-managed',
      APP_BIND_ADDRESS: '127.0.0.1',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    } as typeof settings.env;
    const result = await restorePfbackup(
      buildArchiveContent(settings, fs.readFileSync(sidecarPath).toString('base64')),
      testSetupContext(dir),
      {},
      {
        ...successfulRestoreDeps(appDataDir, true),
        importSnapshot: async () => ({ ok: false, errors: ['Import fehlgeschlagen.'] }),
      },
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
    const { DEFAULT_PORTAL_PROXY_CONTRACT } = await import('@wartezimmer/server-shared');
    const { runtimeAuditEnv, runtimeAuditCompose, runtimeAuditInterfaces } =
      await import('./test-helpers/runtime-postcondition-test-fixtures.js');
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
        buildArchiveContent(settings, fs.readFileSync(sidecarPath).toString('base64')),
        testSetupContext(dir),
        {},
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
        assert.equal(readEnvMap(envPath).get('WARTEZIMMER_APP_IMAGE'), 'wartezimmer/app:current');
        assert.match(fs.readFileSync(path.join(tlsDir, 'Caddyfile'), 'utf8'), /installed-release/);
      }
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

test('restore keeps target installation secrets and never imports missing internal keys', () => {
  const backup = {
    AUTH_KEY_CAPTIVE: 'old',
    MAINTENANCE_TOKEN: 'old',
    SANDBOX_INTERNAL_TOKEN: 'old',
    OPENNDS_FAS_KEY: 'old',
    WARTEZIMMER_APP_IMAGE: 'old',
    PROVIDER_KEY: 'practice-key',
  };
  const current = {
    AUTH_KEY_CAPTIVE: 'new',
    MAINTENANCE_TOKEN: 'new',
    SANDBOX_INTERNAL_TOKEN: 'new',
    WARTEZIMMER_APP_IMAGE: 'new',
  };
  const merged = mergeConfigRestoreEnv(backup, current);
  for (const key of Object.keys(current)) assert.equal(merged[key], 'new');
  assert.equal(merged.OPENNDS_FAS_KEY, undefined);
  assert.equal(merged.PROVIDER_KEY, 'practice-key');
});

for (const backupKind of ['http', 'prepared', 'prepared-with-payload'] as const) {
  test(`restoring ${backupKind} on HTTPS preserves live TLS files and identity`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-v2-preserve-https-'));
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-v2-other-tls-'));
    const { envPath, appDataDir } = seedInstallHome(dir);
    try {
      fs.appendFileSync(
        envPath,
        '\nSETUP_LAN_APP_IP=192.168.1.50\nPROXY_ENABLED=true\nPROXY_MODE=tls-managed\nAPP_BIND_ADDRESS=127.0.0.1\nTLS_STATE=active\nTLS_MODE=managed\nTLS_CUTOVER_APPLIED=true\nTLS_INSTALLATION_ID=live\nTLS_HOSTNAME=live.example.test\nCANONICAL_BASE_URL=https://live.example.test\n',
      );
      const tlsPath = path.join(dir, 'state/tls/caddy-data');
      fs.mkdirSync(tlsPath, { recursive: true });
      fs.writeFileSync(path.join(tlsPath, 'keep.txt'), 'live-private-material');
      const settings = structuredClone(sampleSettings);
      settings.env.SETUP_LAN_APP_IP = '192.168.1.99';
      settings.env.CANONICAL_BASE_URL = 'http://192.168.1.99:8080';
      let payload: string | undefined;
      if (backupKind !== 'http') {
        Object.assign(settings.env, {
          PROXY_ENABLED: 'true',
          PROXY_MODE: 'http',
          TLS_STATE: 'awaiting-operator-dns',
          TLS_MODE: 'managed',
          TLS_INSTALLATION_ID: 'backup',
          TLS_HOSTNAME: 'backup.example.test',
        });
      }
      if (backupKind === 'prepared-with-payload') {
        const archive = path.join(source, 'tls.tgz');
        packTlsSidecarArchive({
          installHome: source,
          installationId: 'backup',
          hostname: 'backup.example.test',
          destinationPath: archive,
        });
        payload = fs.readFileSync(archive).toString('base64');
      }
      const result = await restorePfbackup(
        buildArchiveContent(settings, payload),
        testSetupContext(dir),
        {},
        successfulRestoreDeps(appDataDir, true),
      );
      assert.equal(result.ok, true, result.ok ? undefined : result.errors.join(' '));
      const env = readEnvMap(envPath);
      assert.equal(env.get('TLS_INSTALLATION_ID'), 'live');
      assert.equal(env.get('SETUP_LAN_APP_IP'), '192.168.1.50');
      assert.equal(env.get('CANONICAL_BASE_URL'), 'https://live.example.test');
      assert.equal(env.get('PROXY_ENABLED'), 'true');
      assert.equal(env.get('PROXY_MODE'), 'tls-managed');
      assert.equal(
        fs.readFileSync(path.join(tlsPath, 'keep.txt'), 'utf8'),
        'live-private-material',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(source, { recursive: true, force: true });
    }
  });
}

function recoveryFixture(t: test.TestContext) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-recovery-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { appDataDir, envPath } = seedInstallHome(home);
  const ctx = testSetupContext(home);
  const deps = workingRestoreDeps(appDataDir);
  const operation: RestoreOperation = {
    schemaVersion: 1,
    id: '2026-09-29-restore-test',
    createdAt: new Date().toISOString(),
    phase: 'prepared',
    utilityImage: 'wartezimmer/app:current',
    installationId: null,
  };
  return { home, appDataDir, envPath, ctx, deps, operation };
}

for (const phase of ['prepared', 'rollback-ready'] as const) {
  test(`restore interruption in ${phase} only restarts and checks the old stack`, async (t) => {
    const f = recoveryFixture(t);
    const before = fs.readFileSync(f.envPath, 'utf8');
    const dir = restoreRollbackDirectory(f.home, f.operation.id);
    if (phase === 'rollback-ready')
      await captureMaintenanceRollback(f.ctx, dir, f.deps.appDataAccess!);
    else {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '.env'), 'partial');
    }
    writeRestoreOperation(f.home, { ...f.operation, phase });
    const calls: string[] = [];
    const result = await recoverRestoreOperation(f.ctx, {
      ...f.deps,
      startFullStack: async () => {
        calls.push('start');
        return { ok: true, log: '', gatewaySkipped: false };
      },
      runHealthChecks: async () => {
        calls.push('verify');
        return { ok: true, errors: [] };
      },
      appDataAccess: {
        ...f.deps.appDataAccess!,
        restoreDbFiles: async () => assert.fail('must not restore before cutover'),
      },
      importSnapshot: async () => assert.fail('must not resume restore'),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ['start', 'verify']);
    assert.equal(fs.readFileSync(f.envPath, 'utf8'), before);
    assert.equal(readRestoreOperation(f.home), null);
    assert.equal(fs.existsSync(dir), false);
  });
}

test('failed immediate rollback survives a second interruption; runtime audit decides completion', async (t) => {
  const f = recoveryFixture(t);
  const tls = resolveProxyTlsPaths(f.home).root;
  fs.mkdirSync(tls, { recursive: true });
  fs.writeFileSync(path.join(tls, 'test-key'), 'old-secret');
  const env = fs.readFileSync(f.envPath, 'utf8');
  const manager = fs.readFileSync(path.join(f.home, 'manager-state.json'), 'utf8');
  const result = await restorePfbackup(buildArchiveContent(), f.ctx, {}, f.deps, {
    failRollback: true,
  });
  assert.equal(result.ok, false);
  assert.equal(readRestoreOperation(f.home)?.phase, 'recovery-failed');
  const active = readRestoreOperation(f.home)!;
  const dir = restoreRollbackDirectory(f.home, active.id);
  const failed = await recoverRestoreOperation(f.ctx, {
    ...f.deps,
    appDataAccess: {
      ...f.deps.appDataAccess!,
      restoreDbFiles: async (source) => {
        await f.deps.appDataAccess!.restoreDbFiles(source);
        throw new Error('private simulated interrupted copy');
      },
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(
    fs.readFileSync(path.join(dir, 'app-data/wartezimmer.db'), 'utf8'),
    'seed-wartezimmer.db',
  );
  // Persisted rolling-back is also sufficient if the process never reached its catch block.
  writeRestoreOperation(f.home, { ...f.operation, id: active.id, phase: 'rolling-back' });
  const auditFailure = await recoverRestoreOperation(f.ctx, {
    ...f.deps,
    runHealthChecks: async () => ({ ok: false, errors: ['secret technical output'] }),
  });
  assert.equal(auditFailure.ok, false);
  assert.equal(readRestoreOperationStatus(f.home)?.kind, 'recovery-failed');
  assert.doesNotMatch(
    JSON.stringify(readRestoreOperationStatus(f.home)),
    /secret|technical|utilityImage|installationId/,
  );
  assert.equal((await recoverRestoreOperation(f.ctx, f.deps)).ok, true);
  assert.equal(fs.readFileSync(f.envPath, 'utf8'), env);
  assert.equal(fs.readFileSync(path.join(f.home, 'manager-state.json'), 'utf8'), manager);
  assert.equal(fs.readFileSync(path.join(tls, 'test-key'), 'utf8'), 'old-secret');
  for (const file of APP_DB_RELATED_FILES)
    assert.equal(fs.readFileSync(path.join(f.appDataDir, file), 'utf8'), `seed-${file}`);
  assert.equal(readRestoreOperation(f.home), null);
  assert.equal(fs.existsSync(dir), false);
  assert.equal((await recoverRestoreOperation(f.ctx, f.deps)).ok, true);
});

for (const phase of ['committed', 'recovered'] as const) {
  test(`${phase} only cleans remaining artifacts and preserves the selected user backup`, async (t) => {
    const f = recoveryFixture(t);
    const dir = restoreRollbackDirectory(f.home, f.operation.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.env'), 'partial leftover');
    const backup = path.join(f.home, 'selected.pfbackup');
    fs.writeFileSync(backup, buildArchiveContent());
    const before = fs.readFileSync(f.envPath, 'utf8');
    writeRestoreOperation(f.home, { ...f.operation, phase });
    const result = await recoverRestoreOperation(f.ctx, {
      ...f.deps,
      stopStack: async () => assert.fail('must not stop'),
      startFullStack: async () => assert.fail('must not start'),
    });
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(f.envPath, 'utf8'), before);
    assert.equal(fs.readFileSync(backup, 'utf8'), buildArchiveContent());
    assert.equal(fs.existsSync(dir), false);
    assert.equal(readRestoreOperation(f.home), null);
  });
}

test('restart failure retains the restart decision and ignores partial rollback artifacts', async (t) => {
  const f = recoveryFixture(t);
  writeRestoreOperation(f.home, f.operation);
  assert.equal(
    (
      await recoverRestoreOperation(f.ctx, {
        ...f.deps,
        startFullStack: async () => {
          throw new Error('private unreachable');
        },
      })
    ).ok,
    false,
  );
  const operation = readRestoreOperation(f.home);
  assert.ok(operation?.phase === 'recovery-failed' && operation.recovery === 'restart');
  assert.equal((await recoverRestoreOperation(f.ctx, f.deps)).ok, true);
});

test('unreadable restore blocks direct backend entry points and never rewrites the journal', async (t) => {
  const f = recoveryFixture(t);
  const { prepareInstallOperation, saveStorageFolders, applyRestrictedNetwork } =
    await import('./host-state.js');
  const { stageCustomCertificate } = await import('./host-tls.js');
  writeRestoreOperation(f.home, f.operation);
  for (const text of [
    '{private broken',
    JSON.stringify({ ...f.operation, phase: 'unknown' }),
    JSON.stringify({ ...f.operation, phase: 'recovery-failed' }),
  ]) {
    fs.writeFileSync(restoreOperationPath(f.home), text);
    await assert.rejects(recoverRestoreOperation(f.ctx, f.deps));
    const restored = await restorePfbackup(buildArchiveContent(), f.ctx, {}, f.deps);
    assert.equal(restored.ok, false);
    await assert.rejects(
      prepareInstallOperation(f.ctx, { archivePath: '/unused', mode: 'replace' }),
      { code: 'restore_operation_inconsistent' },
    );
    await assert.rejects(
      saveStorageFolders(f.ctx, { importsHostPath: '/unused', exportsHostPath: '/unused' }),
      { code: 'restore_operation_inconsistent' },
    );
    await assert.rejects(applyRestrictedNetwork(f.ctx), { code: 'restore_operation_inconsistent' });
    assert.throws(
      () => stageCustomCertificate(f.ctx, {} as Parameters<typeof stageCustomCertificate>[1]),
      { code: 'restore_operation_inconsistent' },
    );
    assert.equal(fs.readFileSync(restoreOperationPath(f.home), 'utf8'), text);
    assert.deepEqual(readRestoreOperationStatus(f.home), { kind: 'unreadable' });
  }
});

test('direct restore holds the existing host lock during validation before its journal exists', async (t) => {
  const f = recoveryFixture(t);
  const { prepareInstallOperation } = await import('./host-state.js');
  const { applyPfupdate } = await import('./settings-backup-update.js');
  let finish!: () => void;
  let entered!: () => void;
  const entry = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const restore = restorePfbackup(
    buildArchiveContent(),
    f.ctx,
    {},
    {
      ...f.deps,
      validateSettings: async () => {
        entered();
        await pending;
        return { ok: false, errors: ['validation stopped'] };
      },
    },
  );
  await entry;
  assert.equal(readRestoreOperation(f.home), null);
  try {
    await assert.rejects(
      prepareInstallOperation(f.ctx, { archivePath: '/unused', mode: 'replace' }),
      { code: 'host_mutation_conflict' },
    );
    await assert.rejects(
      applyPfupdate({ archivePath: '/unused.pfupdate', managerVersion: '1' }, f.ctx),
      { code: 'host_mutation_conflict' },
    );
  } finally {
    finish();
    await restore;
  }
  const { hostMutationLock } = await import('./host-mutation-lock.js');
  assert.equal(
    await hostMutationLock(f.home).run('after-restore', async () => 'available'),
    'available',
  );
});

test('restore never overtakes installation; the explicit owning install can recover its nested restore', async (t) => {
  const f = recoveryFixture(t);
  const { createPreparedInstallOperation, markInstallOperationInstalling, readInstallOperation } =
    await import('./install-operation.js');
  const install = createPreparedInstallOperation({
    home: f.home,
    mode: 'fresh',
    releaseVersion: '1',
    sha256: 'a'.repeat(64),
  });
  assert.equal((await restorePfbackup(buildArchiveContent(), f.ctx, {}, f.deps)).ok, false);
  assert.equal(readRestoreOperation(f.home), null);
  markInstallOperationInstalling(f.home, install.id);
  assert.equal((await restorePfbackup(buildArchiveContent(), f.ctx, {}, f.deps)).ok, false);
  const failed = await restorePfbackup(
    buildArchiveContent(),
    f.ctx,
    { installationOperationId: install.id },
    f.deps,
    { failRollback: true },
  );
  assert.equal(failed.ok, false);
  assert.equal(readRestoreOperation(f.home)?.installationId, install.id);
  assert.equal((await recoverRestoreOperation(f.ctx, f.deps)).ok, true);
  assert.equal(readRestoreOperation(f.home), null);
  assert.equal(readInstallOperation(f.home)?.id, install.id);
});

test('restore never recovers or overwrites a separate restricted operation', async (t) => {
  const f = recoveryFixture(t);
  const directory = path.join(f.home, 'state/restricted-operation');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'journal.json'), '{private broken restricted');
  const before = fs.readFileSync(f.envPath, 'utf8');
  const result = await restorePfbackup(buildArchiveContent(), f.ctx, {}, f.deps);
  assert.equal(result.ok, false);
  assert.equal(readRestoreOperation(f.home), null);
  assert.equal(fs.readFileSync(f.envPath, 'utf8'), before);
  assert.equal(
    fs.readFileSync(path.join(directory, 'journal.json'), 'utf8'),
    '{private broken restricted',
  );
});
