import { resolveSetupApiError } from './api-error.js';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  WARTEZIMMER_PROXY_IMAGE_REF,
  WARTEZIMMER_PROXY_IMAGE_REGISTRY_DIGEST,
} from '@wartezimmer/server-shared';
import {
  auditDeliveryImages,
  classifyWartezimmerImages,
  isDeliveryProfile,
  preparePfinstall,
  activatePreparedPfinstall,
  parseDockerLoadOutput,
  assertPackagePlatform,
  detectDockerPlatform,
  releaseStateFromLocalDeliveryImagePair,
  selectLocalDeliveryImagePair,
  writeDeliveryImageEnvFromState,
} from './delivery-images.js';
import { readEnvMap } from './env-file.js';
import { managerStatePath, writeManagerReleaseState } from './manager-state.js';
import {
  installOperationMarkerPath,
  markInstallOperationInstalling,
  readInstallOperation,
} from './install-operation.js';
import { sha256File } from './sha256-file.js';

function createBundleSource(): string {
  const bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-unsafe-source-'));
  const imagesPath = path.join(bundleRoot, 'images', 'wartezimmer-images.tar');
  fs.mkdirSync(path.dirname(imagesPath), { recursive: true });
  fs.writeFileSync(imagesPath, 'fake-images');
  fs.mkdirSync(path.join(bundleRoot, 'templates', 'proxy'), { recursive: true });
  for (const relativePath of [
    '.env.example',
    'docker-compose.delivery.yml',
    'docker-compose.proxy.delivery.yml',
    'docker-compose.proxy-tls.delivery.yml',
    'docker-compose.proxy-restricted.delivery.yml',
    'proxy/Caddyfile',
  ]) {
    const targetPath = path.join(bundleRoot, 'templates', relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${relativePath}\n`);
  }
  addEmbeddedManifest(bundleRoot);
  return bundleRoot;
}

function packBundleSource(bundleRoot: string, archivePath: string): void {
  const packed = spawnSync('tar', ['-czf', archivePath, '-C', bundleRoot, '.'], {
    encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr || 'tar pack failed');
}

function testReleaseManifest() {
  return {
    installFormatVersion: 2 as const,
    version: '1.4.2',
    images: {
      app: 'wartezimmer/app:1.4.2',
      sandbox: 'wartezimmer/sandbox:1.4.2',
      proxy: WARTEZIMMER_PROXY_IMAGE_REF,
    },
    imageDigests: {
      proxy: {
        registryDigest: WARTEZIMMER_PROXY_IMAGE_REGISTRY_DIGEST,
        archiveImageId: `sha256:${'d'.repeat(64)}`,
        platform: `linux/${process.arch === 'x64' ? 'amd64' : process.arch}`,
      },
    },
  };
}

test('parseDockerLoadOutput extracts repository tags', () => {
  const output = [
    'Loaded image: wartezimmer/app:1.4.2',
    'Loaded image: wartezimmer/sandbox:1.4.2',
  ].join('\n');
  assert.deepEqual(parseDockerLoadOutput(output), [
    'wartezimmer/app:1.4.2',
    'wartezimmer/sandbox:1.4.2',
  ]);
});

test('classifyWartezimmerImages maps app and sandbox tags', () => {
  const result = classifyWartezimmerImages(['wartezimmer/app:1.4.2', 'wartezimmer/sandbox:1.4.2']);
  assert.equal(result.appImage, 'wartezimmer/app:1.4.2');
  assert.equal(result.sandboxImage, 'wartezimmer/sandbox:1.4.2');
});

test('selectLocalDeliveryImagePair adopts matching local app and sandbox tags', () => {
  const result = selectLocalDeliveryImagePair([
    'wartezimmer/app:local',
    'wartezimmer/sandbox:local',
    'wartezimmer/gateway:local',
  ]);
  assert.deepEqual(result, {
    appImage: 'wartezimmer/app:local',
    sandboxImage: 'wartezimmer/sandbox:local',
    releaseVersion: 'local',
  });
});

test('selectLocalDeliveryImagePair returns null when app or sandbox is missing', () => {
  assert.equal(selectLocalDeliveryImagePair(['wartezimmer/app:local']), null);
  assert.equal(selectLocalDeliveryImagePair(['wartezimmer/sandbox:local']), null);
});

test('releaseStateFromLocalDeliveryImagePair maps local images without persistence metadata', () => {
  assert.deepEqual(
    releaseStateFromLocalDeliveryImagePair({
      appImage: 'wartezimmer/app:local',
      sandboxImage: 'wartezimmer/sandbox:local',
      releaseVersion: 'local',
    }),
    {
      releaseVersion: 'local',
      appImage: 'wartezimmer/app:local',
      sandboxImage: 'wartezimmer/sandbox:local',
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

test('auditDeliveryImages reads imported release images from manager state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-state-'));
  try {
    fs.writeFileSync(path.join(root, 'docker-compose.delivery.yml'), 'services: {}\n');
    writeManagerReleaseState(root, {
      releaseVersion: '1.4.2',
      appImage: 'wartezimmer/app:1.4.2',
      sandboxImage: 'wartezimmer/sandbox:1.4.2',
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
    assert.equal(status.appImage, 'wartezimmer/app:1.4.2');
    assert.equal(status.sandboxImage, 'wartezimmer/sandbox:1.4.2');
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
        appImage: 'wartezimmer/app:local',
        sandboxImage: 'wartezimmer/sandbox:local',
        releaseVersion: 'local',
      },
      imageExists: async () => true,
    });

    assert.equal(status.required, true);
    assert.equal(status.configured, false);
    assert.equal(status.ready, false);
    assert.equal(status.appImage, 'wartezimmer/app:local');
    assert.equal(status.sandboxImage, 'wartezimmer/sandbox:local');
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
        'PRACTICE_DISPLAY_NAME=Wartezimmer',
        '# WARTEZIMMER_APP_IMAGE=ghcr.io/example/app:v1',
        '# WARTEZIMMER_SANDBOX_IMAGE=ghcr.io/example/sandbox:v1',
        '',
      ].join('\n'),
    );
    writeManagerReleaseState(root, {
      releaseVersion: '1.4.2',
      appImage: 'wartezimmer/app:1.4.2',
      sandboxImage: 'wartezimmer/sandbox:1.4.2',
      archiveSha256: 'd'.repeat(64),
    });

    const result = writeDeliveryImageEnvFromState(root);
    assert.equal(result?.envPath, path.join(root, '.env'));

    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('WARTEZIMMER_APP_IMAGE'), 'wartezimmer/app:1.4.2');
    assert.equal(env.get('WARTEZIMMER_SANDBOX_IMAGE'), 'wartezimmer/sandbox:1.4.2');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepare pins verified bytes without mutating live installation files and activation uses the pin', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pfinstall-prepare-'));
  const source = createBundleSource();
  try {
    const archivePath = path.join(root, 'release.pfinstall');
    packBundleSource(source, archivePath);
    let composeValidated = false;
    const manifest = testReleaseManifest();
    const loaded = [manifest.images.app, manifest.images.sandbox, manifest.images.proxy];
    const prepared = await preparePfinstall(
      root,
      archivePath,
      'fresh',
      { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
      {
        detectDockerPlatform: async () => testReleaseManifest().imageDigests.proxy.platform,
        validateCompose: async () => {
          composeValidated = true;
        },
        dockerLoadArchive: async () => ({ ok: true, loaded, log: '' }),
        imageExists: async () => true,
        inspectImage: async (ref) => ({
          imageId: ref === manifest.images.proxy ? manifest.imageDigests.proxy.archiveImageId : ref,
          platform: manifest.imageDigests.proxy.platform,
        }),
      },
    );
    assert.equal(composeValidated, true);
    assert.equal(prepared.operation.phase, 'prepared');
    assert.equal(fs.existsSync(path.join(root, '.env')), false);
    assert.equal(fs.existsSync(managerStatePath(root)), false);
    assert.equal(fs.existsSync(installOperationMarkerPath(root)), true);
    fs.rmSync(archivePath);

    assert.throws(
      () => activatePreparedPfinstall(root, prepared.operation.id),
      /INSTALL_OPERATION_NOT_COMMITTED/,
    );
    markInstallOperationInstalling(root, prepared.operation.id);
    const activated = activatePreparedPfinstall(root, prepared.operation.id);
    assert.equal(activated.releaseVersion, '1.4.2');
    assert.equal(
      readEnvMap(path.join(root, '.env')).get('WARTEZIMMER_APP_IMAGE'),
      manifest.images.app,
    );
    assert.equal(readInstallOperation(root)?.phase, 'installing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

const readyDocker = {
  installed: true,
  daemonRunning: true,
  composeAvailable: true,
  detail: null,
} as const;

test('prepare rejects image-only archives before docker load', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-image-only-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-image-only-source-'));
  let dockerLoadCalled = false;
  try {
    fs.writeFileSync(path.join(source, 'legacy-images.tar'), 'old images');
    const archivePath = path.join(root, 'wartezimmer-1.4.2.pfinstall');
    const packed = spawnSync('tar', ['-czf', archivePath, '-C', source, 'legacy-images.tar'], {
      encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stderr || 'tar pack failed');

    await assert.rejects(
      preparePfinstall(root, archivePath, 'fresh', readyDocker, {
        ...embeddedDeps(),
        dockerLoadArchive: async () => {
          dockerLoadCalled = true;
          return { ok: true, loaded: [], log: 'unexpected load' };
        },
      }),
      /Das Installationspaket enthält kein internes Manifest/,
    );

    assert.equal(dockerLoadCalled, false);
    assert.equal(fs.existsSync(path.join(root, '.env')), false);
    assert.equal(fs.existsSync(managerStatePath(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('prepare rejects safe but undeclared archive paths before docker load', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-delivery-extra-'));
  const source = createBundleSource();
  let dockerLoadCalled = false;
  try {
    fs.writeFileSync(path.join(source, 'unexpected.txt'), 'not part of the package contract');
    const archivePath = path.join(root, 'release.pfinstall');
    packBundleSource(source, archivePath);

    await assert.rejects(
      preparePfinstall(root, archivePath, 'fresh', readyDocker, {
        ...embeddedDeps(),
        dockerLoadArchive: async () => {
          dockerLoadCalled = true;
          return { ok: true, loaded: [], log: '' };
        },
      }),
      /PFINSTALL_TAR_ENTRY_UNEXPECTED/,
    );
    assert.equal(dockerLoadCalled, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('prepare rejects unsafe tar entry types before extract', async () => {
  for (const entryType of ['symlink', 'hardlink', 'fifo']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `pf-delivery-${entryType}-`));
    const bundleRoot = createBundleSource();
    try {
      const targetPath = path.join(bundleRoot, 'templates', '.env.example');
      if (entryType === 'symlink') {
        fs.unlinkSync(targetPath);
        fs.symlinkSync('/tmp/wartezimmer-outside', targetPath);
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

      const archivePath = path.join(root, 'release.pfinstall');
      packBundleSource(bundleRoot, archivePath);
      await assert.rejects(
        preparePfinstall(root, archivePath, 'fresh', readyDocker, embeddedDeps()),
        /PFUPDATE_TAR_ENTRY_UNSUPPORTED/,
      );
      assert.equal(fs.existsSync(path.join(root, 'proxy', 'Caddyfile')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(bundleRoot, { recursive: true, force: true });
    }
  }
});

test('prepare leaves live templates unchanged when docker load fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pfinstall-load-rollback-'));
  const bundleRoot = createBundleSource();
  try {
    const archivePath = path.join(root, 'release.pfinstall');
    packBundleSource(bundleRoot, archivePath);
    const composePath = path.join(root, 'docker-compose.delivery.yml');
    fs.writeFileSync(composePath, 'old-compose-bytes\n');

    await assert.rejects(
      preparePfinstall(root, archivePath, 'replace', readyDocker, {
        ...embeddedDeps(),
        dockerLoadArchive: async () => ({ ok: false, loaded: [], log: 'load failed' }),
      }),
      /DOCKER_LOAD_FAILED/,
    );
    assert.equal(fs.readFileSync(composePath, 'utf8'), 'old-compose-bytes\n');
    assert.equal(fs.existsSync(path.join(root, '.env')), false);
    assert.equal(fs.existsSync(managerStatePath(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(bundleRoot, { recursive: true, force: true });
  }
});

test('fresh prepare rejects an existing installation before docker load', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pfinstall-existing-'));
  let dockerLoadCalled = false;
  try {
    fs.writeFileSync(path.join(root, '.env'), 'AUTH_ENABLED=true\n');
    const archivePath = path.join(root, 'release.pfinstall');
    fs.writeFileSync(archivePath, 'not inspected');
    await assert.rejects(
      preparePfinstall(root, archivePath, 'fresh', readyDocker, {
        dockerLoadArchive: async () => {
          dockerLoadCalled = true;
          return { ok: true, loaded: [], log: '' };
        },
      }),
      /PFINSTALL_EXISTING_INSTALLATION/,
    );
    assert.equal(dockerLoadCalled, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function addEmbeddedManifest(source: string): void {
  for (const file of ['THIRD_PARTY_NOTICES.txt', 'licenses/caddy/LICENSE.txt']) {
    fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    fs.writeFileSync(path.join(source, file), 'license fixture');
  }
  // Exercise the production build writer against the runtime reader.
  const writer = new URL('../../scripts/release-install-manifest.mjs', import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { writeInstallManifest } from ${JSON.stringify(writer)};
     writeInstallManifest(${JSON.stringify(source)}, ${JSON.stringify(testReleaseManifest())});`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
}

function embeddedDeps(): NonNullable<Parameters<typeof preparePfinstall>[4]> {
  const manifest = testReleaseManifest();
  return {
    detectDockerPlatform: async () => manifest.imageDigests.proxy.platform,
    validateCompose: async () => {},
    dockerLoadArchive: async () => ({ ok: true, loaded: Object.values(manifest.images), log: '' }),
    imageExists: async () => true,
    inspectImage: async () => ({
      imageId: manifest.imageDigests.proxy.archiveImageId,
      platform: manifest.imageDigests.proxy.platform,
    }),
  };
}

test('build-format v2 installs from a renamed single file and activates the pinned package', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-single-file-'));
  const source = createBundleSource();
  try {
    const archive = path.join(root, 'Kopie mit Umlaut ä.pfinstall');
    packBundleSource(source, archive);
    // Unrelated stale sidecars must not override internal metadata.
    fs.writeFileSync(path.join(root, 'manifest.json'), 'broken old sidecar');
    const prepared = await preparePfinstall(root, archive, 'fresh', readyDocker, embeddedDeps());
    assert.equal(prepared.operation.package.sha256, sha256File(archive));
    fs.rmSync(archive);
    fs.rmSync(path.join(root, 'manifest.json'));
    markInstallOperationInstalling(root, prepared.operation.id);
    assert.equal(activatePreparedPfinstall(root, prepared.operation.id).releaseVersion, '1.4.2');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('embedded metadata and payload failures stop before compose validation or Docker load', async (t) => {
  const cases: [string, (source: string) => void, string][] = [
    [
      'broken JSON',
      (source) => fs.writeFileSync(path.join(source, 'manifest.json'), '{'),
      'PFINSTALL_MANIFEST_INVALID',
    ],
    [
      'changed image',
      (source) => fs.appendFileSync(path.join(source, 'images/wartezimmer-images.tar'), 'corrupt'),
      'PFINSTALL_CONTENT_MISMATCH',
    ],
    [
      'changed template',
      (source) => fs.appendFileSync(path.join(source, 'templates/proxy/Caddyfile'), 'corrupt'),
      'PFINSTALL_CONTENT_MISMATCH',
    ],
    [
      'missing license',
      (source) => fs.rmSync(path.join(source, 'licenses/caddy/LICENSE.txt')),
      'PFINSTALL_CONTENT_MISMATCH',
    ],
    ...[
      'version',
      'old version',
      'missing checksum',
      'invalid checksum',
      'extra checksum',
      'bad metadata',
    ].map((kind): [string, (source: string) => void, string] => [
      kind,
      (source) => {
        const file = path.join(source, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (kind === 'version') manifest.installFormatVersion = 99;
        if (kind === 'old version') manifest.installFormatVersion = 1;
        if (kind === 'missing checksum') delete manifest.files['templates/proxy/Caddyfile'];
        if (kind === 'invalid checksum') manifest.files['templates/proxy/Caddyfile'] = 'xyz';
        if (kind === 'extra checksum') manifest.files['../outside'] = 'a'.repeat(64);
        if (kind === 'bad metadata') manifest.imageDigests.proxy.registryDigest = 5;
        fs.writeFileSync(file, JSON.stringify(manifest));
      },
      kind === 'bad metadata' ? 'PFINSTALL_IMAGE_CONTRACT_INVALID' : 'PFINSTALL_MANIFEST_INVALID',
    ]),
  ];
  for (const [name, mutate, code] of cases)
    await t.test(name, async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-single-invalid-'));
      const source = createBundleSource();
      try {
        mutate(source);
        const archive = path.join(root, 'release.pfinstall');
        packBundleSource(source, archive);
        const deps = embeddedDeps();
        deps.validateCompose = async () => assert.fail('must reject before compose');
        deps.dockerLoadArchive = async () => assert.fail('must reject before docker load');
        await assert.rejects(
          preparePfinstall(root, archive, 'fresh', readyDocker, deps),
          (error: unknown) => {
            const resolved = resolveSetupApiError(error);
            assert.equal(resolved.status, 400);
            assert.equal(resolved.body.error.code, code);
            return true;
          },
        );
        assert.equal(readInstallOperation(root), null);
        assert.equal(fs.existsSync(path.join(root, '.env')), false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(source, { recursive: true, force: true });
      }
    });
});

test('legacy format is rejected even with valid external checksums', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-legacy-manifest-'));
  const source = createBundleSource();
  try {
    const archive = path.join(root, 'release.pfinstall');
    fs.rmSync(path.join(source, 'manifest.json'));
    packBundleSource(source, archive);
    fs.writeFileSync(
      path.join(root, 'manifest.json'),
      JSON.stringify({
        ...testReleaseManifest(),
        installFormatVersion: 1,
        archive: 'release.pfinstall',
        sha256: sha256File(archive),
      }),
    );
    fs.writeFileSync(
      path.join(root, 'SHA256SUMS.txt'),
      `${sha256File(archive)}  release.pfinstall\n`,
    );
    const deps = embeddedDeps();
    deps.dockerLoadArchive = async () => assert.fail('must not import legacy images');
    await assert.rejects(preparePfinstall(root, archive, 'fresh', readyDocker, deps), {
      code: 'PFINSTALL_MANIFEST_REQUIRED',
    });
    assert.equal(readInstallOperation(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('wrong architecture returns an actionable API error before importing images', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-architecture-'));
  const source = createBundleSource();
  try {
    const archive = path.join(root, 'wrong.pfinstall');
    packBundleSource(source, archive);
    const deps = embeddedDeps();
    const wrongHost =
      testReleaseManifest().imageDigests.proxy.platform === 'linux/arm64'
        ? 'linux/amd64'
        : 'linux/arm64';
    deps.detectDockerPlatform = async () => wrongHost;
    deps.dockerLoadArchive = async () => assert.fail('must reject before loading');
    await assert.rejects(preparePfinstall(root, archive, 'fresh', readyDocker, deps), (error) => {
      const response = resolveSetupApiError(error);
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'PFINSTALL_PLATFORM_MISMATCH');
      assert.match(response.body.error.message, /Falsche Architektur gewählt/);
      assert.match(response.body.error.message, /AMD64.*ARM64|ARM64.*AMD64/);
      return true;
    });
    assert.equal(readInstallOperation(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('post-load platform mismatch retains its public error instead of becoming internal_error', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-architecture-postload-'));
  const source = createBundleSource();
  try {
    const archive = path.join(root, 'wrong-content.pfinstall');
    packBundleSource(source, archive);
    const deps = embeddedDeps();
    const expected = testReleaseManifest().imageDigests.proxy.platform;
    deps.inspectImage = async () => ({
      imageId: 'test',
      platform: expected === 'linux/arm64' ? 'linux/amd64' : 'linux/arm64',
    });
    await assert.rejects(preparePfinstall(root, archive, 'fresh', readyDocker, deps), (error) => {
      assert.equal(resolveSetupApiError(error).body.error.code, 'PFINSTALL_PLATFORM_MISMATCH');
      return true;
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('platform labels distinguish Intel/AMD x64 from ARM64 in both directions', () => {
  for (const [actual, expected] of [
    ['linux/arm64', 'linux/amd64'],
    ['linux/amd64', 'linux/arm64'],
  ]) {
    assert.throws(
      () => assertPackagePlatform(actual, expected),
      (error) => {
        const response = resolveSetupApiError(error);
        assert.equal(response.status, 400);
        assert.ok(response.body.error.message.includes(expected.replace('/', '-')));
        return true;
      },
    );
    assert.doesNotThrow(() => assertPackagePlatform(expected, expected));
  }
});

test('Docker engine architecture aliases are normalized independently of the manager process', async () => {
  for (const [raw, expected] of [
    ['linux/x86_64', 'linux/amd64'],
    ['linux/aarch64', 'linux/arm64'],
    ['linux/amd64', 'linux/amd64'],
    ['linux/arm64', 'linux/arm64'],
  ]) {
    assert.equal(
      await detectDockerPlatform(async () => ({ code: 0, stdout: raw, stderr: '' })),
      expected,
    );
  }
  await assert.rejects(
    detectDockerPlatform(async () => ({ code: 0, stdout: 'windows/amd64', stderr: '' })),
    { code: 'DOCKER_PLATFORM_UNSUPPORTED' },
  );
  await assert.rejects(
    detectDockerPlatform(async () => ({ code: 1, stdout: '', stderr: 'offline' })),
    { code: 'DOCKER_PLATFORM_UNSUPPORTED' },
  );
});
