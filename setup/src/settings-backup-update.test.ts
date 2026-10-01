import { readUpdateOperation, updateRollbackDirectory } from './update-operation.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  buildPfbackupArchive,
  serializePfbackupArchive,
  PRAXIS_FLOW_PROXY_IMAGE_REF,
} from '@praxis-flow/server-shared';
import { APP_DB_BASENAME, createLocalAppDataAccess } from './app-data-volume.js';
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
      'SETUP_LAN_APP_IP=192.168.1.10',
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
  const db = new DatabaseSync(path.join(appDataDir, APP_DB_BASENAME));
  db.close();

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
    inspectImage: async () => ({
      imageId: `sha256:${'d'.repeat(64)}`,
      platform: `linux/${process.arch === 'x64' ? 'amd64' : process.arch}`,
    }),
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
    composeStatus: async () => ({
      running: true,
      services: [
        { name: 'app', service: 'app', state: 'running', health: 'healthy' },
        { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
      ],
    }),
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
    const deps = mockDeps(appDataDir, backupPath);
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      {
        ...deps,
        createSettingsBackup: async () => {
          assert.equal(readEnvMap(envPath).has('MAINTENANCE_TOKEN'), false);
          return { envPath: '', backupPath };
        },
        stopStack: async () => {
          assert.equal(readUpdateOperation(dir)?.phase, 'prepared');
          assert.equal(readEnvMap(envPath).has('MAINTENANCE_TOKEN'), false);
          return { ok: true, log: 'stopped' };
        },
        startAppStack: async (...args: Parameters<typeof deps.startAppStack>) => {
          assert.equal(readUpdateOperation(dir)?.phase, 'cutover');
          assert.equal((readEnvMap(envPath).get('MAINTENANCE_TOKEN')?.length ?? 0) >= 32, true);
          return deps.startAppStack(...args);
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(readUpdateOperation(dir), null);
    assert.equal(fs.existsSync(updateRollbackDirectory(dir, result.updateId)), false);
    assert.equal(fs.existsSync(backupPath), true);
    if (result.ok) {
      assert.equal(result.report.previousVersion, '2026.07.1');
      assert.equal(result.report.targetVersion, '2026.08.0');
      assert.equal(result.report.backupPath, backupPath);
    }

    const env = readEnvMap(envPath);
    assert.equal(env.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:2026.08.0');
    assert.equal(env.get('PRAXIS_FLOW_SANDBOX_IMAGE'), 'praxis-flow/sandbox:2026.08.0');
    // Product packages omit gateway; existing lab image ref is preserved.
    assert.equal(env.get('PRAXIS_FLOW_GATEWAY_IMAGE'), 'praxis-flow/gateway:2026.07.1');
    assert.equal((env.get('MAINTENANCE_TOKEN')?.length ?? 0) >= 32, true);
    assert.match(
      fs.readFileSync(path.join(dir, '.env.example'), 'utf8'),
      /PRAXIS_FLOW_APP_IMAGE=praxis-flow\/app:2026\.08\.0/,
    );

    const manager = readManagerState(dir);
    assert.equal(manager.release?.releaseVersion, '2026.08.0');
    assert.equal(manager.release?.appImage, 'praxis-flow/app:2026.08.0');
    assert.equal(manager.release?.gatewayImage, 'praxis-flow/gateway:2026.07.1');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate with proxy sets PROXY_IMAGE and seeds Caddyfile without overwrite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-apply-proxy-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { envPath, appDataDir, backupPath } = seedInstallHome(dir);
  const customCaddy = path.join(dir, 'proxy', 'Caddyfile');
  fs.mkdirSync(path.dirname(customCaddy), { recursive: true });
  fs.writeFileSync(customCaddy, '# custom caddyfile\n', 'utf8');
  buildTestPfupdateArchive(archivePath, { version: '2026.08.0', withProxy: true });

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      mockDeps(appDataDir, backupPath),
    );
    assert.equal(result.ok, true);

    const env = readEnvMap(envPath);
    assert.equal(env.get('PRAXIS_FLOW_PROXY_IMAGE'), PRAXIS_FLOW_PROXY_IMAGE_REF);
    assert.equal(fs.readFileSync(customCaddy, 'utf8'), '# custom caddyfile\n');
    assert.equal(fs.existsSync(path.join(dir, 'docker-compose.proxy.delivery.yml')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate rolls back seeded Caddyfile when import fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-apply-proxy-rollback-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { appDataDir, backupPath } = seedInstallHome(dir);
  assert.equal(fs.existsSync(path.join(dir, 'proxy', 'Caddyfile')), false);
  buildTestPfupdateArchive(archivePath, { version: '2026.08.0', withProxy: true });

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
      assert.equal(result.rollbackSucceeded, true);
    }
    assert.equal(fs.existsSync(path.join(dir, 'proxy', 'Caddyfile')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPfupdate rolls back when import fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-apply-fail-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { envPath, appDataDir, backupPath } = seedInstallHome(dir);
  const envExamplePath = path.join(dir, '.env.example');
  fs.writeFileSync(envExamplePath, 'OLD_TEMPLATE=byte-identical\n');
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
    assert.equal(fs.readFileSync(envExamplePath, 'utf8'), 'OLD_TEMPLATE=byte-identical\n');
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

test('applyPfupdate rejects a wrong app platform before stopping the stack', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-platform-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { appDataDir, backupPath } = seedInstallHome(dir);
  buildTestPfupdateArchive(archivePath, '2026.08.0');
  let stopCalls = 0;
  const hostPlatform = `linux/${process.arch === 'x64' ? 'amd64' : process.arch}`;

  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      {
        ...mockDeps(appDataDir, backupPath),
        inspectImage: async (ref) => ({
          imageId: `sha256:${'d'.repeat(64)}`,
          platform: ref.includes('/app:') ? 'linux/wrong-architecture' : hostPlatform,
        }),
        stopStack: async () => {
          stopCalls += 1;
          return { ok: true, log: 'stopped' };
        },
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, UPDATE_PHASES.loadImages);
      assert.match(result.errors.join(' '), /Falsche Architektur gewählt/);
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

test('applyPfupdate rejects a missing local Staff address before stopping the stack', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-staff-preflight-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  const { envPath, appDataDir, backupPath } = seedInstallHome(dir);
  fs.appendFileSync(
    envPath,
    [
      'PROXY_ENABLED=true',
      'PROXY_MODE=http',
      'SETUP_LAN_APP_IP=203.0.113.77',
      'APP_BIND_ADDRESS=127.0.0.1',
      '',
    ].join('\n'),
  );
  buildTestPfupdateArchive(archivePath, '2026.08.0');
  let stopCalls = 0;
  try {
    const result = await applyPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
      {
        ...mockDeps(appDataDir, backupPath),
        stopStack: async () => {
          stopCalls += 1;
          return { ok: true, log: 'stopped' };
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedPhase, UPDATE_PHASES.stopStack);
      assert.match(result.errors.join(' '), /vor dem Stack-Stopp gesperrt/);
    }
    assert.equal(stopCalls, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const failure of [null, 'validation', 'audit'] as const)
  test(`TLS update installs target portal policy and restores it on ${failure ?? 'success'}`, async () => {
    const { DEFAULT_PORTAL_PROXY_CONTRACT } = await import('@praxis-flow/server-shared');
    const { readInstalledPortalContract, writeGeneratedTlsCaddyfile } =
      await import('./proxy-tls.js');
    const { readTlsStatus } = await import('./host-tls.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-policy-'));
    try {
      const { envPath, appDataDir, backupPath } = seedInstallHome(dir);
      fs.appendFileSync(
        envPath,
        '\nPROXY_ENABLED=true\nPROXY_MODE=tls-managed\nAPP_BIND_ADDRESS=127.0.0.1\nSETUP_LAN_APP_IP=192.0.2.10\nTLS_MODE=managed\nTLS_STATE=active\nTLS_CUTOVER_APPLIED=true\nTLS_HOSTNAME=staff.installation.example\nTLS_STAFF_HOSTNAME=staff.installation.example\nTLS_PORTAL_HOSTNAME=portal.installation.example\nTLS_WILDCARD_CERTIFICATE_NAME=*.installation.example\nSETUP_RESTRICTED_ENABLED=true\nSETUP_RESTRICTED_APP_IP=192.0.2.20\nSETUP_RESTRICTED_INTERFACE_ID=name:patient\n',
      );
      const tlsDir = path.join(dir, 'state/tls');
      fs.mkdirSync(tlsDir, { recursive: true });
      fs.writeFileSync(
        path.join(tlsDir, 'Caddyfile'),
        '# PRAXIS-FLOW-GENERATED LAN-TLS v5\nold policy\n',
      );
      const target = structuredClone(DEFAULT_PORTAL_PROXY_CONTRACT);
      const former = target.api.find((route) => route.path.endsWith('/config'))!;
      target.api = [
        ...target.api.filter((route) => route !== former),
        { method: 'GET', path: '/api/v1/portal/new-release-route' },
      ];
      target.internal = [...target.internal, former];
      const archivePath = path.join(dir, 'update.pfupdate');
      buildTestPfupdateArchive(archivePath, { portalContract: target });
      let validations = 0;
      let audits = 0;
      const result = await applyPfupdate(
        { archivePath, managerVersion: '0.5.0', settingsFormatVersion: 1 },
        testCtx(dir),
        {
          ...mockDeps(appDataDir, backupPath),
          networkInterfaces: () => [
            {
              name: 'staff',
              addresses: [{ address: '192.0.2.10', family: 'IPv4', internal: false }],
            },
            {
              name: 'patient',
              addresses: [{ address: '192.0.2.20', family: 'IPv4', internal: false }],
            },
          ],
          validateProxyContract: async (options) => {
            validations++;
            assert.equal(options.oneOff, true);
            const config = fs.readFileSync(path.join(tlsDir, 'Caddyfile'), 'utf8');
            assert.match(config, /new-release-route/);
            assert.doesNotMatch(config, /path \/api\/v1\/portal\/config/);
            assert.match(config, /PORTAL-CONTRACT v1 sha256:[a-f0-9]{64}/);
            return { ok: failure !== 'validation', log: 'policy validation' };
          },
          auditProxyContract: async (input) => {
            audits++;
            const isTarget = input.contract?.api.some((route) =>
              route.path.endsWith('/new-release-route'),
            );
            assert.deepEqual(input.contract, isTarget ? target : DEFAULT_PORTAL_PROXY_CONTRACT);
            assert.equal(isTarget, failure !== 'validation' && audits === 1);
            return failure === 'audit' && isTarget ? 'policy not enforced' : null;
          },
          composeStatus: async () => ({
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
                  { hostIp: '192.0.2.10', publishedPort: 80, targetPort: 80, protocol: 'tcp' },
                  { hostIp: '192.0.2.10', publishedPort: 443, targetPort: 443, protocol: 'tcp' },
                  { hostIp: '192.0.2.20', publishedPort: 443, targetPort: 444, protocol: 'tcp' },
                ],
              },
            ],
          }),
        },
      );
      assert.equal(result.ok, failure === null, JSON.stringify(result));
      assert.equal(validations, 1);
      assert.equal(audits, failure === 'audit' ? 2 : 1);
      if (!result.ok) assert.equal(result.rollbackSucceeded, true, JSON.stringify(result));
      if (failure) {
        assert.equal(
          fs.readFileSync(path.join(tlsDir, 'Caddyfile'), 'utf8'),
          '# PRAXIS-FLOW-GENERATED LAN-TLS v5\nold policy\n',
        );
        assert.equal(fs.existsSync(path.join(tlsDir, 'portal-contract.json')), false);
        assert.equal(readEnvMap(envPath).get('SETUP_RESTRICTED_ENABLED'), 'true');
      } else {
        assert.deepEqual(readInstalledPortalContract(dir), target);
        // Later manager operations retain the target release policy.
        const env = readEnvMap(envPath);
        writeGeneratedTlsCaddyfile(dir, readTlsStatus(env), env);
        assert.match(fs.readFileSync(path.join(tlsDir, 'Caddyfile'), 'utf8'), /new-release-route/);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
