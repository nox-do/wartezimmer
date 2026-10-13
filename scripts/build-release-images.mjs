#!/usr/bin/env node
/**
 * Build delivery images (app + sandbox) and pack a release archive for
 * Wartezimmer Manager **Erstinstallation** (Setup-Wizard: Release-Paket wählen).
 *
 * Für Software-Updates in der Wartung: scripts/build-pfupdate.mjs → eine .pfupdate-Datei.
 *
 * Usage:
 *   npm run release:images
 *   npm run release:images -- --version 1.4.2
 *   WARTEZIMMER_RELEASE_VERSION=1.4.2 npm run release:images
 *   npm run release:images:current -- --version 1.4.2   # pack only, skip build
 *
 * Output (under dist/releases/<version>/):
 *   wartezimmer-<version>-linux-<arch>.pfinstall (complete offline bundle)
 *   Metadata, checksums and license notices are embedded in the package.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  releasePlatforms,
  releaseArchiveName,
  architectureTag,
  assertReleasePlatform,
} from './release-platforms.mjs';
import { appDockerBuildArgs } from './release-app-image.mjs';
import { packReleaseArchive } from './release-archive.mjs';
import { writeInstallManifest } from './release-install-manifest.mjs';
import { prepareDeliveryProxyImage } from './release-proxy-image.mjs';
import { releaseDirectory } from './release-output.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printHelp(proxyImage) {
  console.log(`build-release-images — Wartezimmer delivery release package

Options:
  --version <semver>   Release tag (default: package.json version or WARTEZIMMER_RELEASE_VERSION)
  --output <dir>       Output directory (default: dist/releases)
  --platform <arch>   amd64, arm64, linux/amd64, linux/arm64, all (default: all)
  --no-build           Package existing architecture-tagged images only
  --help               Show this help

Images tagged as:
  wartezimmer/app:<version>
  wartezimmer/sandbox:<version>
  ${proxyImage}   ← optional offline reverse proxy with ACME-DNS (not auto-started)
`);
}

function parseArgs(argv) {
  let version = process.env.WARTEZIMMER_RELEASE_VERSION?.trim() || null;
  let noBuild = false;
  let platformSelection;
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
    if (arg === '--platform') {
      platformSelection = argv[++index];
      if (!platformSelection) throw new Error('--platform benötigt amd64, arm64 oder all.');
      continue;
    }
    if (arg === '--no-build') {
      noBuild = true;
      continue;
    }
    throw new Error(`Unbekanntes Argument: ${arg}`);
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

  return { version, noBuild, outputRoot, showHelp, platforms: releasePlatforms(platformSelection) };
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

function buildReleaseImages(version, platform) {
  const appImage = `wartezimmer/app:${version}`;
  const sandboxImage = `wartezimmer/sandbox:${version}`;

  console.log(`Building ${appImage} …`);
  run('docker', appDockerBuildArgs(version, platform));

  console.log(`Building ${sandboxImage} …`);
  run('docker', [
    'buildx',
    'build',
    '--load',
    '--platform',
    platform,
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

function copyLicenseNotices(outputDir) {
  const relativePaths = ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'licenses/caddy/LICENSE.txt'];
  for (const relativePath of relativePaths) {
    const targetPath = path.join(outputDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(path.join(root, relativePath), targetPath);
  }
  return relativePaths;
}

async function packImages(archivePath, imageRefs, platform) {
  await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });

  const docker = spawn('docker', ['save', '--platform', platform, ...imageRefs], {
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

async function packReleaseBundle(archivePath, imageRefs, metadata) {
  const stagingRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wartezimmer-release-'));
  try {
    const imagesPath = path.join(stagingRoot, 'images', 'wartezimmer-images.tar');
    await packImages(imagesPath, imageRefs, metadata.platform);

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

    copyLicenseNotices(stagingRoot);
    writeInstallManifest(stagingRoot, metadata);

    packReleaseArchive(archivePath, stagingRoot);
  } finally {
    await fs.promises.rm(stagingRoot, { recursive: true, force: true });
  }
}

async function loadProxyReleaseConfig() {
  run('npm', ['run', 'build:server-shared'], { stdio: 'inherit' });
  const modulePath = path.join(root, 'packages/server-shared/dist/pfupdate.js');
  const pfupdate = await import(pathToFileURL(modulePath).href);
  return {
    imageRef: pfupdate.WARTEZIMMER_PROXY_IMAGE_REF,
    baseImageRef: pfupdate.WARTEZIMMER_PROXY_BASE_IMAGE_REF,
    registryDigest: pfupdate.WARTEZIMMER_PROXY_IMAGE_REGISTRY_DIGEST,
  };
}

const { version, noBuild, outputRoot, showHelp, platforms } = parseArgs(process.argv.slice(2));
const proxyRelease = await loadProxyReleaseConfig();
const proxyImage = proxyRelease.imageRef;

if (showHelp) {
  printHelp(proxyImage);
  process.exit(0);
}

const appImage = `wartezimmer/app:${version}`;
const sandboxImage = `wartezimmer/sandbox:${version}`;
assertDockerReady();
const api = runCapture('docker', ['version', '--format', '{{.Server.APIVersion}}']);
const [apiMajor, apiMinor] = api.split('.').map(Number);
if (!(apiMajor > 1 || (apiMajor === 1 && apiMinor >= 49))) {
  throw new Error(
    'Für plattformspezifische Release-Pakete ist Docker API 1.49 oder neuer erforderlich. Bitte Docker Desktop bzw. die Build-Engine aktualisieren.',
  );
}
for (const platform of platforms) {
  const releaseDir = releaseDirectory(version, outputRoot);
  const archiveName = releaseArchiveName(version, platform);
  const archivePath = path.join(releaseDir, archiveName);

  if (noBuild) {
    console.log('Skipping build (--no-build). Checking local tags …');
    for (const ref of [appImage, sandboxImage, proxyImage]) {
      const archivedRef = architectureTag(ref, platform);
      const exists = spawnSync('docker', ['image', 'inspect', archivedRef], { stdio: 'ignore' });
      if (exists.status === 0) run('docker', ['image', 'tag', archivedRef, ref]);
      assertImageExists(ref);
    }
  } else {
    buildReleaseImages(version, platform);
  }

  const proxyImageDigest = prepareDeliveryProxyImage({
    imageRef: proxyImage,
    baseImageRef: proxyRelease.baseImageRef,
    registryDigest: proxyRelease.registryDigest,
    skipBuild: noBuild,
    platform,
    run,
    runCapture,
  });

  for (const ref of [appImage, sandboxImage, proxyImage]) {
    const actual = runCapture('docker', [
      'image',
      'inspect',
      '--platform',
      platform,
      ref,
      '--format',
      '{{.Os}}/{{.Architecture}}',
    ]);
    assertReleasePlatform(actual, platform, ref);
    run('docker', ['image', 'tag', ref, architectureTag(ref, platform)]);
  }

  // Keep update packages already built for this version and architecture.
  fs.mkdirSync(releaseDir, { recursive: true });

  console.log(`Packing ${archivePath} …`);
  await packReleaseBundle(archivePath, [appImage, sandboxImage, proxyImage], {
    version,
    platform,
    images: { app: appImage, sandbox: sandboxImage, proxy: proxyImage },
    imageDigests: { proxy: proxyImageDigest },
  });

  const archiveBytes = fs.statSync(archivePath).size;
  console.log('');
  console.log('Release package ready:');
  console.log(`  ${releaseDir}/`);
  console.log(`    ${archiveName} (${(archiveBytes / (1024 * 1024)).toFixed(1)} MB)`);
  console.log('');
  console.log(`Includes optional offline proxy image ${proxyImage} (xcaddy + acmedns).`);
  console.log('Proxy stays disabled until explicitly enabled in Manager/Setup.');
  console.log('');
  console.log('Upload to customer share (e.g. Google Drive):');
  console.log(`  ${archiveName} (Manifest, Prüfsummen und Lizenznachweise enthalten)`);
  console.log('');
  console.log(
    'Manager import expects one .pfinstall containing images, Compose templates, and Caddy.',
  );
}
