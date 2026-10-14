#!/usr/bin/env node
/**
 * Build architecture-specific Wartezimmer update packages (.pfupdate) for Manager maintenance updates.
 *
 * Usage:
 *   npm run release:pfupdate
 *   npm run release:pfupdate -- --version 2026.08.0
 *   WARTEZIMMER_RELEASE_VERSION=2026.08.0 npm run release:pfupdate
 *   npm run release:pfupdate:current -- --version 2026.08.0   # pack only, skip build
 *
 * Output:
 *   dist/releases/<version>/wartezimmer-update-<version>-linux-<arch>.pfupdate
 */

import { releasePlatforms, architectureTag, assertReleasePlatform } from './release-platforms.mjs';
import { packReleaseArchive } from './release-archive.mjs';
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
import { releaseDirectory } from './release-output.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readManagerVersion() {
  const managerPkgPath = path.join(root, 'manager', 'package.json');
  const managerPkg = JSON.parse(fs.readFileSync(managerPkgPath, 'utf8'));
  const version = String(managerPkg.version ?? '').trim();
  if (!version) {
    throw new Error('manager/package.json version fehlt.');
  }
  return version;
}

function printHelp() {
  console.log(`build-pfupdate — Wartezimmer .pfupdate release package

Liefert eine Datei je Architektur für: Manager → Wartung → Software-Update → Update-Paket wählen.

Options:
  --version <tag>              Release tag (default: package.json version or WARTEZIMMER_RELEASE_VERSION)
  --output <dir>               Output directory (default: dist/releases)
  --minimum-manager-version    Minimum Manager semver (default: manager/package.json version)
  --platform <arch>            amd64, arm64 or all (default: all)
  --no-build                   Skip docker build; package existing local tags only
  --help                       Show this help

Package layout (extracted):
  manifest.json
  SHA256SUMS.txt
  images/wartezimmer-images.tar     ← docker save (app + sandbox + custom Caddy)
  templates/docker-compose.delivery.yml
  templates/docker-compose.proxy.delivery.yml
  templates/docker-compose.proxy-tls.delivery.yml
  templates/docker-compose.proxy-restricted.delivery.yml
  templates/proxy/Caddyfile
  templates/.env.example
  LICENSE
  THIRD_PARTY_NOTICES.txt
  licenses/caddy/LICENSE.txt

Images tagged as:
  wartezimmer/app:<version>
  wartezimmer/sandbox:<version>
  wartezimmer-proxy:2.11.7-acmedns  ← offline reverse proxy with ACME-DNS (not auto-started)
`);
}

function parseArgs(argv) {
  let version = process.env.WARTEZIMMER_RELEASE_VERSION?.trim() || null;
  let noBuild = false;
  let platformSelection;
  let outputRoot = path.join(root, 'dist', 'releases');
  let minimumManagerVersion = readManagerVersion();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
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
    if (arg === '--minimum-manager-version') {
      minimumManagerVersion = argv[index + 1]?.trim() ?? '';
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

  if (!version) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    version = String(pkg.version ?? '').trim();
  }

  if (!version || !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(version)) {
    console.error('Invalid or missing --version (e.g. 2026.08.0).');
    process.exit(1);
  }

  return {
    version,
    noBuild,
    outputRoot,
    minimumManagerVersion,
    platforms: releasePlatforms(platformSelection),
  };
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

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function dockerSaveTar(tarPath, imageRefs, platform) {
  await fs.promises.mkdir(path.dirname(tarPath), { recursive: true });

  const docker = spawn('docker', ['save', '--platform', platform, ...imageRefs], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const output = createWriteStream(tarPath);
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

function copyFileEnsuringDir(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function buildDeliveryEnvExample(version, appImage, sandboxImage, proxyImage) {
  const sourcePath = path.join(root, '.env.example');
  const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
  const imageLines = new Set([
    'WARTEZIMMER_APP_IMAGE',
    'WARTEZIMMER_SANDBOX_IMAGE',
    'WARTEZIMMER_GATEWAY_IMAGE',
    'WARTEZIMMER_PROXY_IMAGE',
  ]);

  const out = [];

  for (const line of lines) {
    const uncommented = line.replace(/^#\s*/, '');
    const key = uncommented.split('=')[0]?.trim();
    if (key && imageLines.has(key)) {
      continue;
    }
    out.push(line);
  }

  out.push('');
  out.push('# Delivery image tags (written by .pfupdate install)');
  out.push(`WARTEZIMMER_APP_IMAGE=${appImage}`);
  out.push(`WARTEZIMMER_SANDBOX_IMAGE=${sandboxImage}`);
  out.push(`WARTEZIMMER_PROXY_IMAGE=${proxyImage}`);

  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

async function loadPfupdateValidation() {
  run('npm', ['run', 'build:server-shared'], { stdio: 'inherit' });
  const modulePath = path.join(root, 'packages/server-shared/dist/pfupdate.js');
  return import(pathToFileURL(modulePath).href);
}

async function validateBuiltPackage(archivePath) {
  const pfupdate = await loadPfupdateValidation();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-validate-'));
  try {
    run('tar', ['xzf', archivePath, '-C', tempRoot]);

    const manifestPath = path.join(tempRoot, 'manifest.json');
    const sumsPath = path.join(tempRoot, 'SHA256SUMS.txt');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Validierung fehlgeschlagen: manifest.json fehlt im Paket.');
    }
    if (!fs.existsSync(sumsPath)) {
      throw new Error('Validierung fehlgeschlagen: SHA256SUMS.txt fehlt im Paket.');
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sha256Sums = fs.readFileSync(sumsPath, 'utf8');
    const files = {};

    for (const entry of manifest.files ?? []) {
      const filePath = path.join(tempRoot, entry.path);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Validierung fehlgeschlagen: ${entry.path} fehlt im Paket.`);
      }
      const stat = fs.statSync(filePath);
      files[entry.path] = {
        sha256: sha256File(filePath),
        byteLength: stat.size,
      };
    }

    const result = pfupdate.validatePfupdatePackage({
      manifest,
      files,
      sha256Sums,
    });

    if (!result.ok) {
      throw new Error(`Validierung fehlgeschlagen:\n  ${result.errors.join('\n  ')}`);
    }

    console.log('Package validation OK.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const { version, noBuild, outputRoot, minimumManagerVersion, platforms } = parseArgs(
  process.argv.slice(2),
);
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
const pfupdate = await loadPfupdateValidation();
const proxyImage = pfupdate.WARTEZIMMER_PROXY_IMAGE_REF;
for (const platform of platforms) {
  const architecture = platform.replace('/', '-');
  const releaseDir = releaseDirectory(version, outputRoot);
  const archiveFileName = `wartezimmer-update-${version}-${architecture}.pfupdate`;
  const archivePath = path.join(releaseDir, archiveFileName);

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
    baseImageRef: pfupdate.WARTEZIMMER_PROXY_BASE_IMAGE_REF,
    registryDigest: pfupdate.WARTEZIMMER_PROXY_IMAGE_REGISTRY_DIGEST,
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
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-staging-'));
  try {
    fs.mkdirSync(releaseDir, { recursive: true });

    const imagesTarPath = path.join(stagingRoot, 'images', 'wartezimmer-images.tar');
    const imagesToSave = [appImage, sandboxImage, proxyImage];
    console.log(`Saving images to ${imagesTarPath} …`);
    await dockerSaveTar(imagesTarPath, imagesToSave, platform);

    copyFileEnsuringDir(
      path.join(root, 'docker-compose.delivery.yml'),
      path.join(stagingRoot, 'templates', 'docker-compose.delivery.yml'),
    );
    copyFileEnsuringDir(
      path.join(root, 'docker-compose.proxy.delivery.yml'),
      path.join(stagingRoot, 'templates', 'docker-compose.proxy.delivery.yml'),
    );
    copyFileEnsuringDir(
      path.join(root, 'docker-compose.proxy-tls.delivery.yml'),
      path.join(stagingRoot, 'templates', 'docker-compose.proxy-tls.delivery.yml'),
    );
    copyFileEnsuringDir(
      path.join(root, 'docker-compose.proxy-restricted.delivery.yml'),
      path.join(stagingRoot, 'templates', 'docker-compose.proxy-restricted.delivery.yml'),
    );
    copyFileEnsuringDir(
      path.join(root, 'proxy', 'Caddyfile'),
      path.join(stagingRoot, 'templates', 'proxy', 'Caddyfile'),
    );
    copyFileEnsuringDir(path.join(root, 'LICENSE'), path.join(stagingRoot, 'LICENSE'));
    copyFileEnsuringDir(
      path.join(root, 'THIRD_PARTY_NOTICES.txt'),
      path.join(stagingRoot, 'THIRD_PARTY_NOTICES.txt'),
    );
    copyFileEnsuringDir(
      path.join(root, 'licenses', 'caddy', 'LICENSE.txt'),
      path.join(stagingRoot, 'licenses', 'caddy', 'LICENSE.txt'),
    );
    fs.writeFileSync(
      path.join(stagingRoot, 'templates', '.env.example'),
      buildDeliveryEnvExample(version, appImage, sandboxImage, proxyImage),
      'utf8',
    );

    const portalModule = await import(
      pathToFileURL(path.join(root, 'packages/server-shared/dist/portal-proxy-contract.js')).href
    );
    // Read from the shipped image, also for --no-build; never pair stale images with workspace rules.
    const imageContract = JSON.parse(
      runCapture('docker', [
        'run',
        '--rm',
        '--platform',
        platform,
        '--network',
        'none',
        '--entrypoint',
        'node',
        appImage,
        '--input-type=module',
        '-e',
        "import { DEFAULT_PORTAL_PROXY_CONTRACT } from '@wartezimmer/server-shared'; process.stdout.write(JSON.stringify(DEFAULT_PORTAL_PROXY_CONTRACT));",
      ]),
    );
    portalModule.parsePortalProxyContract(imageContract);
    fs.writeFileSync(
      path.join(stagingRoot, portalModule.PORTAL_PROXY_CONTRACT_FILE),
      JSON.stringify(imageContract, null, 2) + '\n',
    );

    const packagedPaths = pfupdate.PFUPDATE_ALLOWED_FILE_PATHS.filter(
      (relativePath) => !pfupdate.PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS.includes(relativePath),
    );

    const fileEntries = packagedPaths.map((relativePath) => {
      const absolutePath = path.join(stagingRoot, relativePath);
      const stat = fs.statSync(absolutePath);
      return {
        path: relativePath,
        sha256: sha256File(absolutePath),
        byteLength: stat.size,
      };
    });

    const manifest = pfupdate.buildPfupdateManifest({
      releaseVersion: version,
      minimumManagerVersion,
      images: {
        app: appImage,
        sandbox: sandboxImage,
        proxy: proxyImage,
      },
      imageDigests: {
        proxy: proxyImageDigest,
      },
      files: fileEntries,
    });

    fs.writeFileSync(
      path.join(stagingRoot, 'manifest.json'),
      pfupdate.serializePfupdateManifest(manifest),
      'utf8',
    );
    fs.writeFileSync(
      path.join(stagingRoot, 'SHA256SUMS.txt'),
      pfupdate.formatSha256Sums(fileEntries),
      'utf8',
    );

    console.log(`Packing ${archivePath} …`);
    packReleaseArchive(archivePath, stagingRoot);

    await validateBuiltPackage(archivePath);

    console.log('');
    console.log('Update package ready:');
    console.log(`  ${releaseDir}/`);
    console.log(`    ${archiveFileName}`);
    console.log('');
    console.log(`Release: ${version} · minimum Manager: ${minimumManagerVersion}`);
    console.log(`Proxy image (optional runtime): ${proxyImage}`);
    console.log('Import: Manager → Wartung → Betrieb & Updates → Update-Paket wählen …');
    console.log('');
    console.log(
      'Hinweis: Erstinstallation (Wizard) nutzt weiter npm run release:images (.pfinstall mit internem Manifest).',
    );
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}
