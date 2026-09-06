import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PRAXIS_FLOW_PROXY_IMAGE_REF } from '@praxis-flow/server-shared';
import {
  auditDeliveryImages,
  classifyPraxisFlowImages,
  isDeliveryProfile,
  loadDeliveryImagesFromArchive,
  parseDockerLoadOutput,
  readExpectedSha256ForArchive,
  releaseStateFromLocalDeliveryImagePair,
  selectLocalDeliveryImagePair,
  verifyReleaseArchiveSha256,
  writeDeliveryImageEnvFromState,
} from './delivery-images.js';
import { readEnvMap } from './env-file.js';
import { managerStatePath, writeManagerReleaseState } from './manager-state.js';

function createBundleSource(): string {
  const bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-unsafe-source-'));
  const imagesPath = path.join(bundleRoot, 'images', 'praxis-flow-images.tar');
  fs.mkdirSync(path.dirname(imagesPath), { recursive: true });
  fs.writeFileSync(imagesPath, 'fake-images');
  fs.mkdirSync(path.join(bundleRoot, 'templates', 'proxy'), { recursive: true });
  for (const relativePath of [
    '.env.example',
    'docker-compose.delivery.yml',
    'docker-compose.proxy.delivery.yml',
    'docker-compose.proxy-tls.delivery.yml',
    'proxy/Caddyfile',
  ]) {
    const targetPath = path.join(bundleRoot, 'templates', relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${relativePath}\n`);
  }
  return bundleRoot;
}

function packBundleSource(bundleRoot: string, archivePath: string): void {
  const packed = spawnSync('tar', ['-czf', archivePath, '-C', bundleRoot, '.'], {
    encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr || 'tar pack failed');
}

test('parseDockerLoadOutput extracts repository tags', () => {
  const output = [
    'Loaded image: praxis-flow/app:1.4.2',
    'Loaded image: praxis-flow/sandbox:1.4.2',
  ].join('\n');
  assert.deepEqual(parseDockerLoadOutput(output), [
    'praxis-flow/app:1.4.2',
    'praxis-flow/sandbox:1.4.2',
  ]);
});

test('classifyPraxisFlowImages maps app and sandbox tags', () => {
  const result = classifyPraxisFlowImages(['praxis-flow/app:1.4.2', 'praxis-flow/sandbox:1.4.2']);
  assert.equal(result.appImage, 'praxis-flow/app:1.4.2');
  assert.equal(result.sandboxImage, 'praxis-flow/sandbox:1.4.2');
});

test('selectLocalDeliveryImagePair adopts matching local app and sandbox tags', () => {
  const result = selectLocalDeliveryImagePair([
    'praxis-flow/app:local',
    'praxis-flow/sandbox:local',
    'praxis-flow/gateway:local',
  ]);
  assert.deepEqual(result, {
    appImage: 'praxis-flow/app:local',
    sandboxImage: 'praxis-flow/sandbox:local',
    releaseVersion: 'local',
  });
});

test('selectLocalDeliveryImagePair returns null when app or sandbox is missing', () => {
  assert.equal(selectLocalDeliveryImagePair(['praxis-flow/app:local']), null);
  assert.equal(selectLocalDeliveryImagePair(['praxis-flow/sandbox:local']), null);
});

test('releaseStateFromLocalDeliveryImagePair maps local images without persistence metadata', () => {
  assert.deepEqual(
    releaseStateFromLocalDeliveryImagePair({
      appImage: 'praxis-flow/app:local',
      sandboxImage: 'praxis-flow/sandbox:local',
      releaseVersion: 'local',
    }),
    {
      releaseVersion: 'local',
      appImage: 'praxis-flow/app:local',
      sandboxImage: 'praxis-flow/sandbox:local',
      archiveSha256: null,
    },
  );
});

test('isDeliveryProfile is true when only delivery compose exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-profile-'));
  try {
    fs.writeFileSync(path.join(root, 'docker-compose.delivery.yml'), 'services: {}\n');
    assert.equal(isDeliveryProfile(root), true);
    fs.writeFileSync(path.join(root, 'docker-compose.yml'), 'services: {}\n');
    assert.equal(isDeliveryProfile(root), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readExpectedSha256ForArchive reads manifest.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-sha-'));
  try {
    const archiveName = 'praxis-flow-1.4.2.pfinstall';
    const archivePath = path.join(root, archiveName);
    fs.writeFileSync(archivePath, 'dummy');
    fs.writeFileSync(
      path.join(root, 'manifest.json'),
      JSON.stringify({
        version: '1.4.2',
        archive: archiveName,
        sha256: 'a'.repeat(64),
      }),
    );
    const meta = readExpectedSha256ForArchive(archivePath);
    assert.equal(meta.expectedSha256, 'a'.repeat(64));
    assert.equal(meta.source, 'manifest.json');
    assert.equal(meta.releaseVersion, '1.4.2');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verifyReleaseArchiveSha256 rejects mismatch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-sha-mismatch-'));
  try {
    const archiveName = 'pkg.tar.gz';
    const archivePath = path.join(root, archiveName);
    fs.writeFileSync(archivePath, 'other-content');
    fs.writeFileSync(path.join(root, 'SHA256SUMS.txt'), `${'b'.repeat(64)}  ${archiveName}\n`);
    assert.throws(() => verifyReleaseArchiveSha256(archivePath), /RELEASE_SHA256_MISMATCH/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readExpectedSha256ForArchive throws when checksum files missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-sha-missing-'));
  try {
    const archivePath = path.join(root, 'pkg.tar.gz');
    fs.writeFileSync(archivePath, 'x');
    assert.throws(() => readExpectedSha256ForArchive(archivePath), /RELEASE_SHA256_MISSING/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('auditDeliveryImages reads imported release images from manager state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-state-'));
  try {
    fs.writeFileSync(path.join(root, 'docker-compose.delivery.yml'), 'services: {}\n');
    writeManagerReleaseState(root, {
      releaseVersion: '1.4.2',
      appImage: 'praxis-flow/app:1.4.2',
      sandboxImage: 'praxis-flow/sandbox:1.4.2',
      archiveSha256: 'c'.repeat(64),
    });

    const status = await auditDeliveryImages({
      projectRoot: root,
      envMap: new Map(),
      docker: {
        installed: true,
        daemonRunning: false,
        composeAvailable: true,
        detail: null,
      },
    });

    assert.equal(status.required, true);
    assert.equal(status.configured, true);
    assert.equal(status.appImage, 'praxis-flow/app:1.4.2');
    assert.equal(status.sandboxImage, 'praxis-flow/sandbox:1.4.2');
    assert.equal(status.releaseVersion, '1.4.2');
    assert.equal(status.archiveSha256, 'c'.repeat(64));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('auditDeliveryImages reports local images without treating them as configured', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-readonly-'));
  try {
    fs.writeFileSync(path.join(root, 'docker-compose.delivery.yml'), 'services: {}\n');

    const status = await auditDeliveryImages({
      projectRoot: root,
      envMap: new Map(),
      docker: {
        installed: true,
        daemonRunning: true,
        composeAvailable: true,
        detail: null,
      },
      localDeliveryImagePair: {
        appImage: 'praxis-flow/app:local',
        sandboxImage: 'praxis-flow/sandbox:local',
        releaseVersion: 'local',
      },
      imageExists: async () => true,
    });

    assert.equal(status.required, true);
    assert.equal(status.configured, false);
    assert.equal(status.ready, false);
    assert.equal(status.appImage, 'praxis-flow/app:local');
    assert.equal(status.sandboxImage, 'praxis-flow/sandbox:local');
    assert.equal(status.releaseVersion, 'local');
    assert.equal(status.archiveSha256, null);
    assert.equal(fs.existsSync(path.join(root, '.env')), false);
    assert.equal(fs.existsSync(managerStatePath(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('writeDeliveryImageEnvFromState materializes compose image keys into env', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-env-'));
  try {
    fs.writeFileSync(
      path.join(root, '.env.example'),
      [
        'PRACTICE_DISPLAY_NAME=Praxis Flow',
        '# PRAXIS_FLOW_APP_IMAGE=ghcr.io/example/app:v1',
        '# PRAXIS_FLOW_SANDBOX_IMAGE=ghcr.io/example/sandbox:v1',
        '',
      ].join('\n'),
    );
    writeManagerReleaseState(root, {
      releaseVersion: '1.4.2',
      appImage: 'praxis-flow/app:1.4.2',
      sandboxImage: 'praxis-flow/sandbox:1.4.2',
      archiveSha256: 'd'.repeat(64),
    });

    const result = writeDeliveryImageEnvFromState(root);
    assert.equal(result?.envPath, path.join(root, '.env'));

    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:1.4.2');
    assert.equal(env.get('PRAXIS_FLOW_SANDBOX_IMAGE'), 'praxis-flow/sandbox:1.4.2');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('loadDeliveryImagesFromArchive rejects image-only archives before docker load', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-image-only-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-image-only-source-'));
  let dockerLoadCalled = false;
  try {
    fs.writeFileSync(path.join(root, '.env'), 'PRACTICE_DISPLAY_NAME=Praxis Flow\n');
    fs.writeFileSync(path.join(source, 'legacy-images.tar'), 'old images');
    const archivePath = path.join(root, 'praxis-flow-1.4.2.pfinstall');
    const packed = spawnSync('tar', ['-czf', archivePath, '-C', source, 'legacy-images.tar'], {
      encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stderr || 'tar pack failed');

    await assert.rejects(
      () =>
        loadDeliveryImagesFromArchive(
          root,
          archivePath,
          { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
          {
            verifyReleaseArchiveSha256: () => ({
              sha256: 'c'.repeat(64),
              expectedSha256: 'c'.repeat(64),
              sha256Source: 'manifest.json',
              releaseVersion: '1.4.2',
            }),
            dockerLoadArchive: async () => {
              dockerLoadCalled = true;
              return { ok: true, loaded: [], log: 'unexpected load' };
            },
          },
        ),
      /RELEASE_BUNDLE_UNSUPPORTED/,
    );

    assert.equal(dockerLoadCalled, false);
    assert.equal(
      fs.readFileSync(path.join(root, '.env'), 'utf8'),
      'PRACTICE_DISPLAY_NAME=Praxis Flow\n',
    );
    assert.equal(fs.existsSync(managerStatePath(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('loadDeliveryImagesFromArchive rejects unsafe tar entry types before extract', async () => {
  for (const entryType of ['symlink', 'hardlink', 'fifo']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `pf-delivery-${entryType}-`));
    const bundleRoot = createBundleSource();
    try {
      const targetPath = path.join(bundleRoot, 'templates', '.env.example');
      if (entryType === 'symlink') {
        fs.unlinkSync(targetPath);
        fs.symlinkSync('/tmp/praxis-flow-outside', targetPath);
      } else if (entryType === 'hardlink') {
        const hardlinkSource = path.join(bundleRoot, 'hardlink-source');
        fs.writeFileSync(hardlinkSource, 'linked');
        fs.unlinkSync(targetPath);
        fs.linkSync(hardlinkSource, targetPath);
      } else {
        fs.unlinkSync(targetPath);
        const fifo = spawnSync('mkfifo', [targetPath], { encoding: 'utf8' });
        assert.equal(fifo.status, 0, fifo.stderr || 'mkfifo failed');
      }

      const archivePath = path.join(root, 'release.tar.gz');
      packBundleSource(bundleRoot, archivePath);
      await assert.rejects(
        () =>
          loadDeliveryImagesFromArchive(
            root,
            archivePath,
            { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
            {
              verifyReleaseArchiveSha256: () => ({
                sha256: 'd'.repeat(64),
                expectedSha256: 'd'.repeat(64),
                sha256Source: 'manifest.json',
                releaseVersion: '1.4.2',
              }),
              dockerLoadArchive: async () => ({
                ok: true,
                loaded: [],
                log: 'unexpected load',
              }),
            },
          ),
        /PFUPDATE_TAR_ENTRY_UNSUPPORTED/,
      );
      assert.equal(fs.existsSync(path.join(root, 'proxy', 'Caddyfile')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(bundleRoot, { recursive: true, force: true });
    }
  }
});

test('loadDeliveryImagesFromArchive installs templates from a complete release bundle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-bundle-load-'));
  const bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-bundle-source-'));
  try {
    const imagesPath = path.join(bundleRoot, 'images', 'praxis-flow-images.tar');
    fs.mkdirSync(path.dirname(imagesPath), { recursive: true });
    fs.writeFileSync(imagesPath, 'fake-images');
    fs.mkdirSync(path.join(bundleRoot, 'templates', 'proxy'), { recursive: true });
    fs.writeFileSync(
      path.join(bundleRoot, 'templates', '.env.example'),
      'PRACTICE_DISPLAY_NAME=x\n',
    );
    fs.writeFileSync(
      path.join(bundleRoot, 'templates', 'docker-compose.delivery.yml'),
      'services: {}\n',
    );
    fs.writeFileSync(
      path.join(bundleRoot, 'templates', 'docker-compose.proxy.delivery.yml'),
      'services: {}\n',
    );
    fs.writeFileSync(
      path.join(bundleRoot, 'templates', 'docker-compose.proxy-tls.delivery.yml'),
      'services: {}\n',
    );
    fs.writeFileSync(
      path.join(bundleRoot, 'templates', 'proxy', 'Caddyfile'),
      '# release caddyfile\n',
    );

    const archivePath = path.join(root, 'praxis-flow-1.4.2.pfinstall');
    const packed = spawnSync('tar', ['-czf', archivePath, '-C', bundleRoot, '.']);
    assert.equal(packed.status, 0);
    fs.writeFileSync(path.join(root, '.env.example'), 'PRACTICE_DISPLAY_NAME=old\n');

    await loadDeliveryImagesFromArchive(
      root,
      archivePath,
      { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
      {
        verifyReleaseArchiveSha256: () => ({
          sha256: 'e'.repeat(64),
          expectedSha256: 'e'.repeat(64),
          sha256Source: 'manifest.json',
          releaseVersion: '1.4.2',
        }),
        dockerLoadArchive: async (loadedArchive) => {
          assert.equal(path.basename(loadedArchive), 'praxis-flow-images.tar');
          return {
            ok: true,
            loaded: [
              'praxis-flow/app:1.4.2',
              'praxis-flow/sandbox:1.4.2',
              PRAXIS_FLOW_PROXY_IMAGE_REF,
            ],
            log: 'loaded',
          };
        },
        auditDeliveryImages: async () => ({
          required: true,
          configured: true,
          appImage: 'praxis-flow/app:1.4.2',
          sandboxImage: 'praxis-flow/sandbox:1.4.2',
          releaseVersion: '1.4.2',
          archiveSha256: 'e'.repeat(64),
          appPresent: true,
          sandboxPresent: true,
          ready: true,
        }),
      },
    );

    assert.equal(
      fs.readFileSync(path.join(root, 'proxy', 'Caddyfile'), 'utf8'),
      '# release caddyfile\n',
    );
    assert.equal(
      fs.readFileSync(path.join(root, 'docker-compose.delivery.yml'), 'utf8'),
      'services: {}\n',
    );
    assert.equal(
      fs.readFileSync(path.join(root, '.env.example'), 'utf8'),
      'PRACTICE_DISPLAY_NAME=x\n',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(bundleRoot, { recursive: true, force: true });
  }
});
