import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { buildPfbackupArchive, serializePfbackupArchive } from '@wartezimmer/server-shared';
import {
  discoverRecoveryBackups,
  inspectRecoveryArchive,
  pinRecoveryBackup,
  readPinnedRecoveryBackup,
} from './recovery-backup.js';
import {
  attachInstallBackup,
  createPreparedInstallOperation,
  installOperationDirectory,
  markInstallOperationInstalling,
  readInstallOperation,
} from './install-operation.js';
import {
  finishInstallRecovery,
  previewInstallRecovery,
  type RecoveryDeps,
} from './install-recovery.js';
import { testSetupContext } from './test-setup-context.js';
import { packTlsSidecarArchive } from './tls-backup-sidecar.js';

function fixture(t: TestContext) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-recovery-v2-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, 'backups'));
  return home;
}
const settings = {
  settingsFormatVersion: 1,
  env: { MAINTENANCE_TOKEN: 'backup-secret' },
  opsSettings: {},
  authSettings: {},
  messagingProviderConfigs: [],
};
function archive(createdAt = '2026-09-20T12:00:00.000Z') {
  return serializePfbackupArchive(
    buildPfbackupArchive({ settings, managerState: { release: null }, createdAt }),
  );
}
function prepare(home: string) {
  fs.writeFileSync(path.join(home, 'backups/wartezimmer-backup-valid.pfbackup'), archive());
  const operation = createPreparedInstallOperation({
    home,
    mode: 'replace',
    sha256: 'a'.repeat(64),
    releaseVersion: '2',
  });
  const candidate = discoverRecoveryBackups(home)[0]!;
  return attachInstallBackup(
    home,
    operation.id,
    pinRecoveryBackup(home, operation.id, candidate.id),
  );
}
const healthyDeps: RecoveryDeps = {
  status: (async () => ({
    docker: { daemonRunning: true, composeAvailable: true },
    compose: {
      running: true,
      services: ['app', 'sandbox'].map((service) => ({
        service,
        state: 'running',
        health: 'healthy',
      })),
    },
  })) as unknown as RecoveryDeps['status'],
  maintenance: async () => ({
    authenticated: true,
    compatible: true,
    status: 'compatible',
    settingsFormatVersion: 1,
    stackVersion: '1.0.0',
  }),
  inspect: async () => ({
    ok: true,
    currentTlsClaimsHttps: false,
    compatibility: {
      archiveValid: true,
      settingsValid: true,
      targetAppReachable: true,
      restoreSupported: true,
      warnings: [],
    },
  }),
};

test('offline discovery skips newer corrupt/v1 files, directories and symlinks; exposes no paths or secrets', (t) => {
  const home = fixture(t);
  fs.writeFileSync(path.join(home, 'backups/wartezimmer-backup-old.pfbackup'), archive());
  fs.writeFileSync(path.join(home, 'backups/wartezimmer-backup-new.pfbackup'), '{broken');
  const old = JSON.parse(archive());
  old.manifest.pfbackupFormatVersion = 1;
  fs.writeFileSync(path.join(home, 'backups/wartezimmer-backup-v1.pfbackup'), JSON.stringify(old));
  fs.symlinkSync(
    path.join(home, 'backups/wartezimmer-backup-old.pfbackup'),
    path.join(home, 'backups/wartezimmer-backup-link.pfbackup'),
  );
  fs.mkdirSync(path.join(home, 'backups/wartezimmer-backup-directory.pfbackup'));
  const candidates = discoverRecoveryBackups(home);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.archiveUsable, true);
  assert.doesNotMatch(JSON.stringify(candidates), /backup-secret|\/|pfbackup/);
});

test('pinned bytes survive source removal and any changed pinned content is rejected', (t) => {
  const home = fixture(t);
  const operation = prepare(home);
  fs.rmSync(path.join(home, 'backups'), { recursive: true });
  assert.equal(readPinnedRecoveryBackup(home, operation), archive());
  fs.writeFileSync(
    path.join(installOperationDirectory(home, operation.id), 'backup.pfbackup'),
    archive('2026-09-21T12:00:00Z'),
  );
  assert.throws(() => readPinnedRecoveryBackup(home, operation), /verändert/);
});

test('embedded TLS requires a valid archive and matching identity offline', (t) => {
  const home = fixture(t);
  const tlsPath = path.join(home, 'tls.tgz');
  packTlsSidecarArchive({
    installHome: home,
    installationId: 'source',
    hostname: 'source.test',
    destinationPath: tlsPath,
  });
  const env = {
    TLS_STATE: 'active',
    TLS_INSTALLATION_ID: 'source',
    TLS_HOSTNAME: 'source.test',
    PROXY_MODE: 'tls-managed',
    CANONICAL_BASE_URL: 'https://source.test',
  };
  const good = buildPfbackupArchive({
    settings: { ...settings, env },
    managerState: { release: null },
    tlsArchiveBase64: fs.readFileSync(tlsPath).toString('base64'),
  });
  assert.equal(inspectRecoveryArchive(serializePfbackupArchive(good)).containsTls, true);
  const bad = buildPfbackupArchive({
    settings: { ...settings, env: { ...env, TLS_INSTALLATION_ID: 'other' } },
    managerState: { release: null },
    tlsArchiveBase64: good.tlsArchiveBase64,
  });
  assert.throws(() => inspectRecoveryArchive(serializePfbackupArchive(bad)), /HTTPS/);
});

test('preview and finish recheck pinned digest before restore and retain marker on failure', async (t) => {
  const home = fixture(t);
  const operation = prepare(home);
  markInstallOperationInstalling(home, operation.id);
  let restores = 0;
  const deps: RecoveryDeps = {
    ...healthyDeps,
    restore: async () => {
      restores++;
      return {
        ok: false,
        restoreId: 'test',
        failedPhase: 'import_snapshot',
        rollbackAttempted: true,
        rollbackSucceeded: true,
        errors: ['failed'],
      };
    },
  };
  assert.equal(
    (await previewInstallRecovery(testSetupContext(home), operation.id, deps)).restoreCompatible,
    true,
  );
  const result = await finishInstallRecovery(
    testSetupContext(home),
    { operationId: operation.id, action: 'restore' },
    deps,
  );
  assert.equal(result.ok, false);
  assert.equal(restores, 1);
  assert.ok(readInstallOperation(home));
  fs.appendFileSync(
    path.join(installOperationDirectory(home, operation.id), 'backup.pfbackup'),
    ' ',
  );
  await assert.rejects(
    previewInstallRecovery(testSetupContext(home), operation.id, deps),
    /verändert/,
  );
  await assert.rejects(
    finishInstallRecovery(
      testSetupContext(home),
      { operationId: operation.id, action: 'restore' },
      deps,
    ),
    /verändert/,
  );
  assert.equal(restores, 1);
  assert.equal(
    (
      await finishInstallRecovery(
        testSetupContext(home),
        { operationId: operation.id, action: 'without-backup' },
        deps,
      )
    ).ok,
    true,
  );
  assert.equal(readInstallOperation(home), null);
  assert.equal(fs.readdirSync(path.join(home, 'backups')).length, 1);
});

test('incompatible backup never reaches restore; unhealthy baseline cannot finish', async (t) => {
  const home = fixture(t);
  const operation = prepare(home);
  markInstallOperationInstalling(home, operation.id);
  const deps: RecoveryDeps = {
    ...healthyDeps,
    inspect: async () => ({
      ok: false,
      currentTlsClaimsHttps: false,
      compatibility: {
        archiveValid: true,
        settingsValid: false,
        targetAppReachable: true,
        restoreSupported: false,
        warnings: [],
      },
      errors: ['incompatible'],
    }),
    restore: async () => {
      throw new Error('must not restore');
    },
  };
  assert.equal(
    (
      await finishInstallRecovery(
        testSetupContext(home),
        { operationId: operation.id, action: 'restore' },
        deps,
      )
    ).ok,
    false,
  );
  deps.maintenance = async () => ({
    authenticated: false,
    compatible: false,
    status: 'unauthorized',
    settingsFormatVersion: null,
    stackVersion: null,
  });
  assert.equal(
    (
      await finishInstallRecovery(
        testSetupContext(home),
        { operationId: operation.id, action: 'without-backup' },
        deps,
      )
    ).ok,
    false,
  );
  assert.ok(readInstallOperation(home));
});

test('successful restore finishes the operation and retains automatic backups', async (t) => {
  const home = fixture(t);
  const operation = prepare(home);
  markInstallOperationInstalling(home, operation.id);
  let restores = 0;
  const result = await finishInstallRecovery(
    testSetupContext(home),
    { operationId: operation.id, action: 'restore' },
    {
      ...healthyDeps,
      restore: async (content) => {
        assert.equal(content, archive());
        restores++;
        return {
          ok: true,
          restoreId: 'done',
          report: {
            restoreId: 'done',
            routingMode: 'simple',
            portalEnabled: false,
            providerCredentialsSkipped: false,
            disabledProviderIds: [],
            compose: { running: true, services: [] },
          },
        };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(restores, 1);
  assert.equal(readInstallOperation(home), null);
  assert.equal(fs.readdirSync(path.join(home, 'backups')).length, 1);
});

test('selected recovery backup blocks creating a new TLS identity', async (t) => {
  const home = fixture(t);
  const operation = prepare(home);
  markInstallOperationInstalling(home, operation.id);
  const { prepareHostTls } = await import('./host-tls.js');
  await assert.rejects(
    prepareHostTls(testSetupContext(home), { mode: 'managed', lanIp: '192.168.1.10' }),
    /aus dem Backup übernommen/,
  );
  assert.equal(fs.existsSync(path.join(home, 'state/tls')), false);
});

for (const health of ['starting', 'unhealthy']) {
  test(`recovery explains sandbox ${health} and permits completion after it becomes healthy`, async (t) => {
    const home = fixture(t);
    const operation = prepare(home);
    markInstallOperationInstalling(home, operation.id);
    const ctx = testSetupContext(home);
    const status = await healthyDeps.status!(ctx);
    status.compose!.services.find((service) => service.service === 'sandbox')!.health = health;
    let maintenanceCalls = 0;
    const deps: RecoveryDeps = {
      ...healthyDeps,
      status: async () => status,
      maintenance: async () => {
        maintenanceCalls++;
        return {
          authenticated: true,
          compatible: true,
          status: 'compatible',
          settingsFormatVersion: 1,
          stackVersion: '1.0.0',
        };
      },
    };
    const before = await previewInstallRecovery(ctx, operation.id, deps);
    assert.equal(before.baselineReady, false);
    assert.equal(before.baselineErrors.length, 1);
    assert.match(
      before.baselineErrors[0],
      health === 'starting' ? /Sandbox.*noch nicht/ : /Sandbox.*fehlgeschlagen/,
    );
    assert.equal(maintenanceCalls, 0);
    const failed = await finishInstallRecovery(
      ctx,
      { operationId: operation.id, action: 'without-backup' },
      deps,
    );
    assert.equal(failed.ok, false);
    assert.deepEqual(failed.errors, before.baselineErrors);
    assert.ok(readInstallOperation(home));
    status.compose!.services.find((service) => service.service === 'sandbox')!.health = 'healthy';
    const after = await previewInstallRecovery(ctx, operation.id, deps);
    assert.equal(after.baselineReady, true);
    assert.deepEqual(after.baselineErrors, []);
  });
}

test('recovery reports an unavailable authenticated maintenance API', async (t) => {
  const home = fixture(t);
  const operation = prepare(home);
  markInstallOperationInstalling(home, operation.id);
  const result = await previewInstallRecovery(testSetupContext(home), operation.id, {
    ...healthyDeps,
    maintenance: async () => ({
      authenticated: false,
      compatible: false,
      status: 'unreachable',
      settingsFormatVersion: null,
      stackVersion: null,
    }),
  });
  assert.equal(result.baselineReady, false);
  assert.deepEqual(result.baselineErrors, ['Der Manager kann die App zurzeit nicht erreichen.']);
});
