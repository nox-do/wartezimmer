import { discoverRecoveryBackups, readPinnedRecoveryBackup } from './recovery-backup.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildPfbackupArchive,
  serializePfbackupArchive,
  PRAXIS_FLOW_PROXY_IMAGE_REF,
  PRAXIS_FLOW_PROXY_IMAGE_REGISTRY_DIGEST,
} from '@praxis-flow/server-shared';
import {
  prepareInstallOperation,
  commitPreparedInstallOperation,
  getHostStatus,
} from './host-state.js';
import { readInstallOperation } from './install-operation.js';
import { sha256File } from './sha256-file.js';
import { readEnvMap } from './env-file.js';
import { testSetupContext } from './test-setup-context.js';

async function withInstallFixture(
  run: (fixture: {
    home: string;
    archivePath: string;
    calls: () => string[][];
    failDown: string;
  }) => Promise<void>,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-install-recovery-'));
  const oldCli = process.env.PRAXIS_FLOW_DOCKER_CLI;
  try {
    const home = path.join(root, 'home');
    const bundle = path.join(root, 'bundle');
    fs.mkdirSync(home);
    fs.mkdirSync(path.join(bundle, 'images'), { recursive: true });
    fs.writeFileSync(path.join(bundle, 'images/praxis-flow-images.tar'), 'test images');
    for (const relative of [
      '.env.example',
      'docker-compose.delivery.yml',
      'docker-compose.proxy.delivery.yml',
      'docker-compose.proxy-tls.delivery.yml',
      'docker-compose.proxy-restricted.delivery.yml',
      'proxy/Caddyfile',
    ]) {
      const target = path.join(bundle, 'templates', relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.resolve(import.meta.dirname, '../..', relative), target);
    }
    const archivePath = path.join(root, 'release.pfinstall');
    const packed = spawnSync('tar', ['-czf', archivePath, '-C', bundle, '.'], { encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const images = {
      app: 'praxis-flow/app:1.4.2',
      sandbox: 'praxis-flow/sandbox:1.4.2',
      proxy: PRAXIS_FLOW_PROXY_IMAGE_REF,
    };
    const imageId = `sha256:${'d'.repeat(64)}`;
    const arch = process.arch === 'x64' ? 'amd64' : process.arch;
    fs.writeFileSync(
      path.join(root, 'manifest.json'),
      JSON.stringify({
        installFormatVersion: 1,
        version: '1.4.2',
        archive: 'release.pfinstall',
        sha256: sha256File(archivePath),
        images,
        imageDigests: {
          proxy: {
            registryDigest: PRAXIS_FLOW_PROXY_IMAGE_REGISTRY_DIGEST,
            archiveImageId: imageId,
            platform: `linux/${arch}`,
          },
        },
      }),
    );
    const log = path.join(root, 'docker-calls.jsonl');
    const failDown = path.join(root, 'fail-down');
    const cli = path.join(root, 'docker');
    fs.writeFileSync(
      cli,
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args.includes('down') && fs.existsSync(${JSON.stringify(failDown)})) process.exit(1);
if (args[0] === 'volume' && args[1] === 'inspect') process.exit(1);
if (args[0] === 'load') console.log(${JSON.stringify(
        Object.values(images)
          .map((ref) => `Loaded image: ${ref}`)
          .join('\n'),
      )});
if (args[0] === 'image' && args[1] === 'inspect') console.log(JSON.stringify({ Id: ${JSON.stringify(imageId)}, Os: 'linux', Architecture: ${JSON.stringify(arch)} }));
`,
      { mode: 0o755 },
    );
    process.env.PRAXIS_FLOW_DOCKER_CLI = cli;
    await run({
      home,
      archivePath,
      failDown,
      calls: () =>
        fs
          .readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as string[]),
    });
  } finally {
    if (oldCli === undefined) delete process.env.PRAXIS_FLOW_DOCKER_CLI;
    else process.env.PRAXIS_FLOW_DOCKER_CLI = oldCli;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('replace prepares and commits despite a broken old proxy configuration', async () => {
  await withInstallFixture(async ({ home, archivePath, calls }) => {
    const before = 'SETUP_LAN_APP_IP=192.168.1.10\nPROXY_ENABLED=true\nPROXY_MODE=off\n';
    fs.writeFileSync(path.join(home, '.env'), before);
    const ctx = testSetupContext(home);
    assert.equal((await getHostStatus(ctx)).installation?.kind, 'inconsistent');
    const prepared = await prepareInstallOperation(ctx, { archivePath, mode: 'replace' });
    assert.equal(prepared.operation.phase, 'prepared');
    assert.equal(fs.readFileSync(path.join(home, '.env'), 'utf8'), before);
    assert.equal(
      calls().some((args) => args.includes('down')),
      false,
    );
    await commitPreparedInstallOperation(ctx, {
      operationId: prepared.operation.id,
      replaceConfirmed: true,
    });
    assert.equal(
      calls().some((args) => args.includes('down')),
      true,
    );
    assert.notEqual(fs.readFileSync(path.join(home, '.env'), 'utf8'), before);
  });
});

test('fresh retry requires confirmation and resets partial state while retaining backups', async () => {
  await withInstallFixture(async ({ home, archivePath, calls, failDown }) => {
    const ctx = testSetupContext(home);
    const prepared = await prepareInstallOperation(ctx, { archivePath, mode: 'fresh' });
    await commitPreparedInstallOperation(ctx, { operationId: prepared.operation.id });
    assert.equal(
      calls().some((args) => args.includes('down')),
      false,
    );
    fs.appendFileSync(path.join(home, '.env'), '\nPARTIAL_SETUP=yes\n');
    fs.mkdirSync(path.join(home, 'backups'));
    fs.writeFileSync(path.join(home, 'backups/keep.pfbackup'), 'keep');
    await assert.rejects(
      commitPreparedInstallOperation(ctx, { operationId: prepared.operation.id }),
      /ausdrücklich bestätigt/,
    );
    assert.equal(
      calls().some((args) => args.includes('down')),
      false,
    );
    fs.writeFileSync(failDown, 'fail');
    await assert.rejects(
      commitPreparedInstallOperation(ctx, {
        operationId: prepared.operation.id,
        replaceConfirmed: true,
      }),
      /INSTALL_COMPOSE_TEARDOWN_FAILED/,
    );
    assert.equal(readEnvMap(path.join(home, '.env')).get('PARTIAL_SETUP'), 'yes');
    assert.equal(readInstallOperation(home)?.phase, 'installing');
    fs.rmSync(failDown);
    await commitPreparedInstallOperation(ctx, {
      operationId: prepared.operation.id,
      replaceConfirmed: true,
    });
    const teardown = calls().find((args) => args.includes('down'))!;
    assert.ok(teardown.includes('--volumes'));
    assert.ok(teardown.includes('--remove-orphans'));
    assert.equal(readEnvMap(path.join(home, '.env')).has('PARTIAL_SETUP'), false);
    assert.equal(fs.readFileSync(path.join(home, 'backups/keep.pfbackup'), 'utf8'), 'keep');
    assert.equal(readInstallOperation(home)?.id, prepared.operation.id);
  });
});

test('replace pins the chosen v2 backup and reset preserves those bytes', async () => {
  await withInstallFixture(async ({ home, archivePath }) => {
    fs.mkdirSync(path.join(home, 'backups'));
    const backupPath = path.join(home, 'backups/praxis-flow-backup-test.pfbackup');
    const content = serializePfbackupArchive(
      buildPfbackupArchive({
        settings: {
          settingsFormatVersion: 1,
          env: {},
          opsSettings: {},
          authSettings: {},
          messagingProviderConfigs: [],
        },
        managerState: { release: null },
      }),
    );
    fs.writeFileSync(backupPath, content);
    const candidate = discoverRecoveryBackups(home)[0]!;
    const ctx = testSetupContext(home);
    const prepared = await prepareInstallOperation(ctx, {
      archivePath,
      mode: 'replace',
      backupCandidateId: candidate.id,
    });
    assert.equal(prepared.operation.backupContainsTls, false);
    fs.unlinkSync(backupPath);
    await commitPreparedInstallOperation(ctx, {
      operationId: prepared.operation.id,
      replaceConfirmed: true,
    });
    assert.equal(readPinnedRecoveryBackup(home, readInstallOperation(home)!), content);
    assert.equal(readEnvMap(path.join(home, '.env')).get('TLS_STATE'), undefined);
  });
});
