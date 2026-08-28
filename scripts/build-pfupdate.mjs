#!/usr/bin/env node
/**
 * Build a single Praxis Flow update package (.pfupdate) for Manager maintenance updates.
 *
 * Usage:
 *   npm run release:pfupdate
 *   npm run release:pfupdate -- --version 2026.08.0
 *   PRAXIS_FLOW_RELEASE_VERSION=2026.08.0 npm run release:pfupdate
 *   npm run release:pfupdate:pack -- --version 2026.08.0   # pack only, skip build
 *   npm run release:pfupdate -- --with-gateway             # lab: include openNDS gateway
 *
 * Output:
 *   dist/releases/praxis-flow-update-<version>.pfupdate
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
  console.log(`build-pfupdate — Praxis Flow .pfupdate release package

Liefert genau eine Datei für: Manager → Wartung → Software-Update → Update-Paket wählen.

Options:
  --version <tag>              Release tag (default: package.json version or PRAXIS_FLOW_RELEASE_VERSION)
  --output <dir>               Output directory (default: dist/releases)
  --minimum-manager-version    Minimum Manager semver (default: manager/package.json version)
  --no-build                   Skip docker build; package existing local tags only
  --with-gateway               Include openNDS gateway image + compose (lab only; not product)
  --help                       Show this help

Package layout (extracted):
  manifest.json
  SHA256SUMS.txt
  images/praxis-flow-images.tar     ← docker save (app + sandbox + custom Caddy; + gateway if --with-gateway)
  templates/docker-compose.delivery.yml
  templates/docker-compose.proxy.delivery.yml
  templates/docker-compose.proxy-tls.delivery.yml
  templates/proxy/Caddyfile
  templates/.env.example
  THIRD_PARTY_NOTICES.txt
  licenses/caddy/LICENSE.txt
  templates/docker-compose.gateway.delivery.yml   ← only with --with-gateway

Images tagged as:
  praxis-flow/app:<version>
  praxis-flow/sandbox:<version>
  praxis-flow-proxy:2.11.4-acmedns  ← offline reverse proxy with ACME-DNS (not auto-started)
  praxis-flow/gateway:<version>     ← only with --with-gateway (lab / openNDS reference)
`);
}

function parseArgs(argv) {
  let version = process.env.PRAXIS_FLOW_RELEASE_VERSION?.trim() || null;
  let noBuild = false;
  let withGateway = false;
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
    if (arg === '--no-build') {
      noBuild = true;
      continue;
    }
    if (arg === '--with-gateway') {
      withGateway = true;
    }
  }

  if (!version) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    version = String(pkg.version ?? '').trim();
  }

  if (!version || !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(version)) {
    console.error('Invalid or missing --version (e.g. 2026.08.0).');
    process.exit(1);
  }

  return { version, noBuild, withGateway, outputRoot, minimumManagerVersion };
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

function buildReleaseImages(version, { withGateway = false } = {}) {
  const appImage = `praxis-flow/app:${version}`;
  const sandboxImage = `praxis-flow/sandbox:${version}`;
  const gatewayImage = `praxis-flow/gateway:${version}`;

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

  if (withGateway) {
    console.log(`Building ${gatewayImage} …`);
    run('docker', [
      'build',
      '-f',
      'gateway/Dockerfile',
      '-t',
      gatewayImage,
      '--sbom=true',
      '--provenance=mode=max',
      '.',
    ]);
  }

  return { appImage, sandboxImage, gatewayImage: withGateway ? gatewayImage : null };
}

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function dockerSaveTar(tarPath, imageRefs) {
  await fs.promises.mkdir(path.dirname(tarPath), { recursive: true });

  const docker = spawn('docker', ['save', ...imageRefs], {
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

function buildDeliveryEnvExample(version, appImage, sandboxImage, gatewayImage, proxyImage) {
  const sourcePath = path.join(root, '.env.example');
  const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
  const imageLines = new Set([
    'PRAXIS_FLOW_APP_IMAGE',
    'PRAXIS_FLOW_SANDBOX_IMAGE',
    'PRAXIS_FLOW_GATEWAY_IMAGE',
    'PRAXIS_FLOW_PROXY_IMAGE',
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
  out.push(`PRAXIS_FLOW_APP_IMAGE=${appImage}`);
  out.push(`PRAXIS_FLOW_SANDBOX_IMAGE=${sandboxImage}`);
  if (gatewayImage) {
    out.push(`PRAXIS_FLOW_GATEWAY_IMAGE=${gatewayImage}`);
  }
  out.push(`PRAXIS_FLOW_PROXY_IMAGE=${proxyImage}`);

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

const { version, noBuild, withGateway, outputRoot, minimumManagerVersion } = parseArgs(
  process.argv.slice(2),
);
const appImage = `praxis-flow/app:${version}`;
const sandboxImage = `praxis-flow/sandbox:${version}`;
const gatewayImage = withGateway ? `praxis-flow/gateway:${version}` : null;
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-staging-'));
const archiveFileName = `praxis-flow-update-${version}.pfupdate`;
const archivePath = path.join(outputRoot, archiveFileName);

assertDockerReady();

const pfupdate = await loadPfupdateValidation();
const proxyImage = pfupdate.PRAXIS_FLOW_PROXY_IMAGE_REF;

if (noBuild) {
  console.log('Skipping build (--no-build). Checking local tags …');
  assertImageExists(appImage);
  assertImageExists(sandboxImage);
  assertImageExists(proxyImage);
  if (withGateway) {
    assertImageExists(gatewayImage);
  }
} else {
  buildReleaseImages(version, { withGateway });
}

const proxyImageDigest = prepareDeliveryProxyImage({
  imageRef: proxyImage,
  baseImageRef: pfupdate.PRAXIS_FLOW_PROXY_BASE_IMAGE_REF,
  registryDigest: pfupdate.PRAXIS_FLOW_PROXY_IMAGE_REGISTRY_DIGEST,
  skipBuild: noBuild,
  run,
  runCapture,
});

try {
  fs.mkdirSync(outputRoot, { recursive: true });

  const imagesTarPath = path.join(stagingRoot, 'images', 'praxis-flow-images.tar');
  const imagesToSave = [appImage, sandboxImage, proxyImage];
  if (withGateway) {
    imagesToSave.splice(2, 0, gatewayImage);
  }
  console.log(`Saving images to ${imagesTarPath} …`);
  await dockerSaveTar(imagesTarPath, imagesToSave);

  copyFileEnsuringDir(
    path.join(root, 'docker-compose.delivery.yml'),
    path.join(stagingRoot, 'templates', 'docker-compose.delivery.yml'),
  );
  if (withGateway) {
    copyFileEnsuringDir(
      path.join(root, 'docker-compose.gateway.delivery.yml'),
      path.join(stagingRoot, 'templates', 'docker-compose.gateway.delivery.yml'),
    );
  }
  copyFileEnsuringDir(
    path.join(root, 'docker-compose.proxy.delivery.yml'),
    path.join(stagingRoot, 'templates', 'docker-compose.proxy.delivery.yml'),
  );
  copyFileEnsuringDir(
    path.join(root, 'docker-compose.proxy-tls.delivery.yml'),
    path.join(stagingRoot, 'templates', 'docker-compose.proxy-tls.delivery.yml'),
  );
  copyFileEnsuringDir(
    path.join(root, 'proxy', 'Caddyfile'),
    path.join(stagingRoot, 'templates', 'proxy', 'Caddyfile'),
  );
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
    buildDeliveryEnvExample(version, appImage, sandboxImage, gatewayImage, proxyImage),
    'utf8',
  );

  const packagedPaths = pfupdate.PFUPDATE_ALLOWED_FILE_PATHS.filter((relativePath) => {
    if (!withGateway && pfupdate.PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS.includes(relativePath)) {
      return false;
    }
    return true;
  });

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
      ...(withGateway ? { gateway: gatewayImage } : {}),
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
  run('tar', ['czf', archivePath, '-C', stagingRoot, '.']);

  await validateBuiltPackage(archivePath);

  console.log('');
  console.log('Update package ready:');
  console.log(`  ${archivePath}`);
  console.log('');
  console.log(`Release: ${version} · minimum Manager: ${minimumManagerVersion}`);
  console.log(`Proxy image (optional runtime): ${proxyImage}`);
  if (withGateway) {
    console.log(`Gateway image (lab only): ${gatewayImage}`);
  } else {
    console.log('Gateway image: omitted (use --with-gateway for lab openNDS packages)');
  }
  console.log('Import: Manager → Wartung → Betrieb & Updates → Update-Paket wählen …');
  console.log('');
  console.log(
    'Hinweis: Erstinstallation (Wizard) nutzt weiter npm run release:images (.tar.gz + Sidecar).',
  );
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
