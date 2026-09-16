#!/usr/bin/env node
/**
 * Build delivery images (app + sandbox) and pack a release archive for
 * Praxis Flow Manager **Erstinstallation** (Setup-Wizard: Release-Paket wählen).
 *
 * Für Software-Updates in der Wartung: scripts/build-pfupdate.mjs → eine .pfupdate-Datei.
 *
 * Usage:
 *   npm run release:images
 *   npm run release:images -- --version 1.4.2
 *   PRAXIS_FLOW_RELEASE_VERSION=1.4.2 npm run release:images
 *   npm run release:images:pack -- --version 1.4.2   # pack only, skip build
 *
 * Output (under dist/releases/praxis-flow-<version>/):
 *   praxis-flow-<version>.pfinstall (complete offline bundle)
 *   manifest.json
 *   SHA256SUMS.txt
 *   THIRD_PARTY_NOTICES.txt
 *   licenses/caddy/LICENSE.txt
 */

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appDockerBuildArgs } from './release-app-image.mjs';
import { prepareDeliveryProxyImage } from './release-proxy-image.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printHelp(proxyImage) {
  console.log(`build-release-images — Praxis Flow delivery release package

Options:
  --version <semver>   Release tag (default: package.json version or PRAXIS_FLOW_RELEASE_VERSION)
  --output <dir>       Output directory (default: dist/releases)
  --no-build           Skip docker build; package existing local tags only
  --help               Show this help

Images tagged as:
  praxis-flow/app:<version>
  praxis-flow/sandbox:<version>
  ${proxyImage}   ← optional offline reverse proxy with ACME-DNS (not auto-started)
`);
}

function parseArgs(argv) {
  let version = process.env.PRAXIS_FLOW_RELEASE_VERSION?.trim() || null;
  let noBuild = false;
  let outputRoot = path.join(root, 'dist', 'releases');
  let showHelp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      showHelp = true;
      continue;
    }
    if (arg === '--version') {
      version = argv[index + 1]?.trim() ?? '';
      index += 1;
      continue;
    }
    if (arg === '--output') {
      outputRoot = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (arg === '--no-build') {
      noBuild = true;
    }
  }

  if (!showHelp) {
    if (!version) {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      version = String(pkg.version ?? '').trim();
    }

    if (!version || !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(version)) {
      console.error('Invalid or missing --version (use semver, e.g. 1.4.2).');
      process.exit(1);
    }
  }

  return { version, noBuild, outputRoot, showHelp };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    console.error(detail || `${command} ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function assertDockerReady() {
  run('docker', ['info']);
}

function assertImageExists(imageRef) {
  runCapture('docker', ['image', 'inspect', imageRef, '--format', '{{.Id}}']);
}

function buildReleaseImages(version) {
  const appImage = `praxis-flow/app:${version}`;
  const sandboxImage = `praxis-flow/sandbox:${version}`;

  console.log(`Building ${appImage} …`);
  run('docker', appDockerBuildArgs(version));

  console.log(`Building ${sandboxImage} …`);
  run('docker', [
    'build',
    '-f',
    'sandbox/Dockerfile',
    '-t',
    sandboxImage,
    '--sbom=true',
    '--provenance=mode=max',
    '.',
  ]);

  return { appImage, sandboxImage };
}

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function writeManifest(outputDir, manifest) {
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

function writeSha256Sums(outputDir, entries) {
  const lines = entries.map(([fileName, digest]) => `${digest}  ${fileName}`);
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8');
}

function copyThirdPartyNotices(outputDir) {
  const relativePaths = ['THIRD_PARTY_NOTICES.txt', 'licenses/caddy/LICENSE.txt'];
  for (const relativePath of relativePaths) {
    const targetPath = path.join(outputDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(path.join(root, relativePath), targetPath);
  }
  return relativePaths;
}

async function packImages(archivePath, imageRefs) {
  await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });

  const docker = spawn('docker', ['save', ...imageRefs], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const output = createWriteStream(archivePath);

  const pipeDone = pipeline(docker.stdout, output);

  const exitCode = await new Promise((resolve, reject) => {
    docker.on('error', reject);
    docker.on('close', resolve);
  });

  await pipeDone;

  if (exitCode !== 0) {
    process.exit(exitCode ?? 1);
  }
}

async function packReleaseBundle(archivePath, imageRefs) {
  const stagingRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'praxis-flow-release-'));
  try {
    const imagesPath = path.join(stagingRoot, 'images', 'praxis-flow-images.tar');
    await packImages(imagesPath, imageRefs);

    for (const relativePath of [
      '.env.example',
      'docker-compose.delivery.yml',
      'docker-compose.proxy.delivery.yml',
      'docker-compose.proxy-tls.delivery.yml',
      'docker-compose.proxy-restricted.delivery.yml',
      'proxy/Caddyfile',
    ]) {
      const targetPath = path.join(stagingRoot, 'templates', relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(path.join(root, relativePath), targetPath);
    }

    const result = spawnSync('tar', ['-czf', archivePath, '-C', stagingRoot, '.'], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
      throw new Error(detail || 'RELEASE_BUNDLE_PACK_FAILED');
    }
  } finally {
    await fs.promises.rm(stagingRoot, { recursive: true, force: true });
  }
}

async function loadProxyReleaseConfig() {
  run('npm', ['run', 'build:server-shared'], { stdio: 'inherit' });
  const modulePath = path.join(root, 'packages/server-shared/dist/pfupdate.js');
  const pfupdate = await import(pathToFileURL(modulePath).href);
  return {
    imageRef: pfupdate.PRAXIS_FLOW_PROXY_IMAGE_REF,
    baseImageRef: pfupdate.PRAXIS_FLOW_PROXY_BASE_IMAGE_REF,
    registryDigest: pfupdate.PRAXIS_FLOW_PROXY_IMAGE_REGISTRY_DIGEST,
  };
}

const { version, noBuild, outputRoot, showHelp } = parseArgs(process.argv.slice(2));
const proxyRelease = await loadProxyReleaseConfig();
const proxyImage = proxyRelease.imageRef;

if (showHelp) {
  printHelp(proxyImage);
  process.exit(0);
}

const appImage = `praxis-flow/app:${version}`;
const sandboxImage = `praxis-flow/sandbox:${version}`;
const releaseDir = path.join(outputRoot, `praxis-flow-${version}`);
const archiveName = `praxis-flow-${version}.pfinstall`;
const archivePath = path.join(releaseDir, archiveName);

assertDockerReady();

if (noBuild) {
  console.log('Skipping build (--no-build). Checking local tags …');
  assertImageExists(appImage);
  assertImageExists(sandboxImage);
  assertImageExists(proxyImage);
} else {
  buildReleaseImages(version);
}

const proxyImageDigest = prepareDeliveryProxyImage({
  imageRef: proxyImage,
  baseImageRef: proxyRelease.baseImageRef,
  registryDigest: proxyRelease.registryDigest,
  skipBuild: noBuild,
  run,
  runCapture,
});

fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

console.log(`Packing ${archivePath} …`);
await packReleaseBundle(archivePath, [appImage, sandboxImage, proxyImage]);

const archiveSha256 = sha256File(archivePath);
const archiveBytes = fs.statSync(archivePath).size;
const thirdPartyNoticePaths = copyThirdPartyNotices(releaseDir);
const manifest = {
  installFormatVersion: 1,
  version,
  createdAt: new Date().toISOString(),
  images: {
    app: appImage,
    sandbox: sandboxImage,
    proxy: proxyImage,
  },
  imageDigests: {
    proxy: proxyImageDigest,
  },
  thirdPartyNotices: thirdPartyNoticePaths,
  archive: archiveName,
  sha256: archiveSha256,
  envExample: {
    PRAXIS_FLOW_APP_IMAGE: appImage,
    PRAXIS_FLOW_SANDBOX_IMAGE: sandboxImage,
    PRAXIS_FLOW_PROXY_IMAGE: proxyImage,
  },
  notes: {
    proxyImageSizeHintMb: 85,
    proxyImageGzipHintMb: 22,
    proxyRuntimeDefault: 'disabled',
  },
};

writeManifest(releaseDir, manifest);
writeSha256Sums(releaseDir, [
  [archiveName, archiveSha256],
  ...thirdPartyNoticePaths.map((relativePath) => [
    relativePath,
    sha256File(path.join(releaseDir, relativePath)),
  ]),
]);

console.log('');
console.log('Release package ready:');
console.log(`  ${releaseDir}/`);
console.log(`    ${archiveName} (${(archiveBytes / (1024 * 1024)).toFixed(1)} MB)`);
console.log('    manifest.json');
console.log('    SHA256SUMS.txt');
console.log('    THIRD_PARTY_NOTICES.txt + licenses/caddy/LICENSE.txt');
console.log('');
console.log(`Includes optional offline proxy image ${proxyImage} (xcaddy + acmedns).`);
console.log('Proxy stays disabled until explicitly enabled in Manager/Setup.');
console.log('');
console.log('Upload to customer share (e.g. Google Drive):');
console.log(`  kompletter Ordner praxis-flow-${version} (inkl. Lizenznachweise)`);
console.log('');
console.log(
  'Manager import expects one .pfinstall containing images, Compose templates, and Caddy.',
);
