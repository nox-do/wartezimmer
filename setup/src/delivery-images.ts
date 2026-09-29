import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PRAXIS_FLOW_PROXY_IMAGE_ENV_KEY,
  PRAXIS_FLOW_PROXY_IMAGE_REF,
  PRAXIS_FLOW_PROXY_IMAGE_REGISTRY_DIGEST,
  pickLoadedProxyImageRef,
  type DeliveryImagesStatus,
} from '@praxis-flow/server-shared';
import type { DockerStatus } from './docker.js';
import { runDockerCommand } from './docker-cli.js';
import { backupEnvFile, readEnvMap, updateEnvKeys } from './env-file.js';
import {
  readManagerState,
  managerStatePath,
  releaseEnvFromManagerState,
  writeManagerReleaseState,
  type ManagerReleaseState,
} from './manager-state.js';
import {
  assertRegularFileInStaging,
  listTarArchiveEntriesVerbose,
  validateTarArchiveEntries,
} from './pfupdate-package.js';
import { sha256File } from './sha256-file.js';
import { requirePackageFileExtension } from './package-file-extension.js';
import {
  createPreparedInstallOperation,
  installOperationDirectory,
  pinnedReleasePath,
  readInstallOperation,
  type InstallMode,
  type InstallOperation,
} from './install-operation.js';

export type { DeliveryImagesStatus } from '@praxis-flow/server-shared';

export type LocalDeliveryImagePair = {
  appImage: string;
  sandboxImage: string;
  releaseVersion: string | null;
};

export type LoadDeliveryImagesCoreResult = {
  envPath: string;
  backupPath: string | null;
  loadedImages: string[];
  appImage: string;
  sandboxImage: string;
  deliveryImages: DeliveryImagesStatus;
  sha256Verified: boolean;
  sha256: string;
  releaseVersion: string | null;
  sha256Source: 'manifest.json' | 'SHA256SUMS.txt';
};

export function isDeliveryProfile(projectRoot: string): boolean {
  const hasDevCompose = fs.existsSync(path.join(projectRoot, 'docker-compose.yml'));
  if (hasDevCompose) {
    return false;
  }
  return fs.existsSync(path.join(projectRoot, 'docker-compose.delivery.yml'));
}

export function parseDockerLoadOutput(output: string): string[] {
  const loaded: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^Loaded image:\s*(.+)$/);
    if (match?.[1]) {
      loaded.push(match[1].trim());
    }
  }
  return loaded;
}

export function classifyPraxisFlowImages(refs: string[]): {
  appImage: string | null;
  sandboxImage: string | null;
} {
  let appImage: string | null = null;
  let sandboxImage: string | null = null;

  for (const ref of refs) {
    if (ref.startsWith('sha256:')) {
      continue;
    }
    const lower = ref.toLowerCase();
    if (lower.includes('sandbox')) {
      sandboxImage = ref;
      continue;
    }
    if (lower.includes('/app') || lower.includes('-app') || lower.includes('praxis-flow/app')) {
      appImage = ref;
    }
  }

  return { appImage, sandboxImage };
}

export async function dockerImageExists(ref: string): Promise<boolean> {
  const result = await runDockerCommand(['image', 'inspect', ref, '--format', '{{.Id}}']);
  return result.code === 0;
}

function parseImageRef(ref: string): { repository: string; tag: string; ref: string } | null {
  const trimmed = ref.trim();
  if (!trimmed || trimmed.includes('<none>')) {
    return null;
  }
  const colon = trimmed.lastIndexOf(':');
  if (colon <= 0 || colon === trimmed.length - 1) {
    return null;
  }
  return {
    repository: trimmed.slice(0, colon),
    tag: trimmed.slice(colon + 1),
    ref: trimmed,
  };
}

export function selectLocalDeliveryImagePair(refs: string[]): LocalDeliveryImagePair | null {
  const appImages = refs
    .map(parseImageRef)
    .filter((ref): ref is NonNullable<ReturnType<typeof parseImageRef>> =>
      Boolean(ref && ref.repository === 'praxis-flow/app'),
    );
  const sandboxImages = refs
    .map(parseImageRef)
    .filter((ref): ref is NonNullable<ReturnType<typeof parseImageRef>> =>
      Boolean(ref && ref.repository === 'praxis-flow/sandbox'),
    );

  if (appImages.length === 0 || sandboxImages.length === 0) {
    return null;
  }

  for (const appImage of appImages) {
    const sandboxImage = sandboxImages.find((candidate) => candidate.tag === appImage.tag);
    if (sandboxImage) {
      return {
        appImage: appImage.ref,
        sandboxImage: sandboxImage.ref,
        releaseVersion: appImage.tag,
      };
    }
  }

  return {
    appImage: appImages[0].ref,
    sandboxImage: sandboxImages[0].ref,
    releaseVersion: null,
  };
}

export async function findLocalDeliveryImagePair(): Promise<LocalDeliveryImagePair | null> {
  const result = await runDockerCommand(['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}']);
  if (result.code !== 0) {
    return null;
  }
  return selectLocalDeliveryImagePair(result.stdout.split(/\r?\n/));
}

export function releaseStateFromLocalDeliveryImagePair(
  pair: LocalDeliveryImagePair | null,
): ManagerReleaseState | null {
  if (!pair) {
    return null;
  }

  return {
    releaseVersion: pair.releaseVersion,
    appImage: pair.appImage,
    sandboxImage: pair.sandboxImage,
    archiveSha256: null,
  };
}

export async function dockerLoadArchive(archivePath: string): Promise<{
  ok: boolean;
  loaded: string[];
  log: string;
}> {
  const result = await runDockerCommand(['load', '-i', archivePath]);
  const log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const loaded = parseDockerLoadOutput(log);
  return { ok: result.code === 0 && loaded.length > 0, loaded, log };
}

const RELEASE_BUNDLE_TEMPLATE_PATHS = [
  'templates/.env.example',
  'templates/docker-compose.delivery.yml',
  'templates/docker-compose.proxy.delivery.yml',
  'templates/docker-compose.proxy-tls.delivery.yml',
  'templates/docker-compose.proxy-restricted.delivery.yml',
  'templates/proxy/Caddyfile',
] as const;

type PreparedReleaseBundle = {
  dockerArchivePath: string;
  stagingDir: string | null;
};

type ReleaseManifest = {
  installFormatVersion: 1;
  version: string;
  archive: string;
  sha256: string;
  images: { app: string; sandbox: string; proxy: string };
  imageDigests: {
    proxy: { registryDigest: string; archiveImageId: string; platform: string };
  };
};

export type DockerImageInspection = { imageId: string; platform: string };

export function hostDockerPlatform(arch = process.arch): string {
  return `linux/${arch === 'x64' ? 'amd64' : arch}`;
}

export async function inspectImagesForHostPlatform(
  refs: readonly string[],
  inspectImage: (ref: string) => Promise<DockerImageInspection> = inspectDockerImage,
  errorCode = 'DOCKER_IMAGE_PLATFORM_MISMATCH',
): Promise<Map<string, DockerImageInspection>> {
  const inspections = await Promise.all(
    refs.map(async (ref) => [ref, await inspectImage(ref)] as const),
  );
  const expected = hostDockerPlatform();
  for (const [ref, inspection] of inspections) {
    if (inspection.platform.toLowerCase() !== expected) {
      throw new Error(
        `${errorCode}: ${ref} is ${inspection.platform || 'unknown'}, expected ${expected}`,
      );
    }
  }
  return new Map(inspections);
}

export async function inspectDockerImage(ref: string): Promise<DockerImageInspection> {
  const result = await runDockerCommand(['image', 'inspect', ref, '--format', '{{json .}}']);
  if (result.code !== 0) throw new Error(`DOCKER_IMAGE_INSPECT_FAILED: ${ref}`);
  const parsed = JSON.parse(result.stdout) as { Id?: string; Os?: string; Architecture?: string };
  return {
    imageId: String(parsed.Id ?? '').toLowerCase(),
    platform: `${String(parsed.Os ?? '').toLowerCase()}/${String(parsed.Architecture ?? '').toLowerCase()}`,
  };
}

function prepareReleaseBundle(archivePath: string): PreparedReleaseBundle {
  const entries = listTarArchiveEntriesVerbose(archivePath);
  validateTarArchiveEntries(entries);
  const dockerArchive = 'images/praxis-flow-images.tar';
  const allowedFiles = new Set<string>([dockerArchive, ...RELEASE_BUNDLE_TEMPLATE_PATHS]);
  for (const entry of entries) {
    if (!entry.name) continue;
    const allowed =
      entry.type === 'file'
        ? allowedFiles.has(entry.name)
        : [...allowedFiles].some((file) => file.startsWith(`${entry.name}/`));
    if (!allowed) throw new Error(`PFINSTALL_TAR_ENTRY_UNEXPECTED: ${entry.rawName}`);
  }
  if (!entries.some((entry) => entry.name === dockerArchive)) {
    throw new Error('RELEASE_BUNDLE_UNSUPPORTED');
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-flow-release-'));
  const extracted = spawnSync('tar', ['-xzf', archivePath, '-C', stagingDir], {
    encoding: 'utf8',
  });
  if (extracted.status !== 0) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    const detail = [extracted.stderr, extracted.stdout].filter(Boolean).join('\n').trim();
    throw new Error(detail || 'RELEASE_BUNDLE_EXTRACT_FAILED');
  }

  for (const relativePath of RELEASE_BUNDLE_TEMPLATE_PATHS) {
    try {
      assertRegularFileInStaging(stagingDir, relativePath);
    } catch {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      throw new Error(`RELEASE_BUNDLE_TEMPLATE_MISSING: ${relativePath}`);
    }
  }
  assertRegularFileInStaging(stagingDir, dockerArchive);

  return {
    dockerArchivePath: path.join(stagingDir, dockerArchive),
    stagingDir,
  };
}

export function readExpectedSha256ForArchive(archivePath: string): {
  expectedSha256: string;
  source: 'manifest.json' | 'SHA256SUMS.txt';
  releaseVersion: string | null;
  manifest: ReleaseManifest | null;
} {
  const dir = path.dirname(archivePath);
  const fileName = path.basename(archivePath);

  const manifestPath = path.join(dir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ReleaseManifest;
    const expectedSha256 = manifest.sha256?.trim().toLowerCase();
    if (expectedSha256) {
      if (manifest.archive && manifest.archive !== fileName) {
        throw new Error(
          `RELEASE_MANIFEST_ARCHIVE_MISMATCH: manifest archive=${manifest.archive}, selected=${fileName}`,
        );
      }
      return {
        expectedSha256,
        source: 'manifest.json',
        releaseVersion: manifest.version?.trim() || null,
        manifest,
      };
    }
  }

  const sumsPath = path.join(dir, 'SHA256SUMS.txt');
  if (fs.existsSync(sumsPath)) {
    for (const line of fs.readFileSync(sumsPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([a-fA-F0-9]{64})\s{1,2}(.+)$/);
      if (!match) {
        continue;
      }
      const expectedSha256 = match[1].toLowerCase();
      const listedFile = match[2].trim();
      if (listedFile === fileName) {
        return {
          expectedSha256,
          source: 'SHA256SUMS.txt',
          releaseVersion: null,
          manifest: null,
        };
      }
    }
  }

  throw new Error('RELEASE_SHA256_MISSING');
}

export function verifyReleaseArchiveSha256(archivePath: string): {
  sha256: string;
  expectedSha256: string;
  sha256Source: 'manifest.json' | 'SHA256SUMS.txt';
  releaseVersion: string | null;
  manifest: ReleaseManifest | null;
} {
  const meta = readExpectedSha256ForArchive(archivePath);
  const actualSha256 = sha256File(archivePath);
  if (actualSha256 !== meta.expectedSha256) {
    throw new Error(
      `RELEASE_SHA256_MISMATCH: expected ${meta.expectedSha256}, got ${actualSha256}`,
    );
  }
  return {
    sha256: actualSha256,
    expectedSha256: meta.expectedSha256,
    sha256Source: meta.source,
    releaseVersion: meta.releaseVersion,
    manifest: meta.manifest,
  };
}

function ensureEnvFromExample(projectRoot: string): string {
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    return envPath;
  }
  const examplePath = path.join(projectRoot, '.env.example');
  if (!fs.existsSync(examplePath)) {
    throw new Error('ENV_EXAMPLE_MISSING');
  }
  fs.copyFileSync(examplePath, envPath);
  return envPath;
}

export function resolveDeliveryImageConfig(input: {
  release?: ManagerReleaseState | null;
  projectRoot: string;
  envMap: Map<string, string>;
}): ManagerReleaseState | null {
  const release =
    input.release !== undefined ? input.release : readManagerState(input.projectRoot).release;
  if (release) {
    return release;
  }

  const appImage = input.envMap.get('PRAXIS_FLOW_APP_IMAGE')?.trim() || null;
  const sandboxImage = input.envMap.get('PRAXIS_FLOW_SANDBOX_IMAGE')?.trim() || null;
  if (!appImage || !sandboxImage) {
    return null;
  }

  return {
    releaseVersion: null,
    appImage,
    sandboxImage,
    archiveSha256: '',
  };
}

export function writeDeliveryImageEnvFromState(projectRoot: string): {
  envPath: string;
  keysWritten: string[];
} | null {
  const updates = releaseEnvFromManagerState(readManagerState(projectRoot));
  if (!updates.PRAXIS_FLOW_APP_IMAGE || !updates.PRAXIS_FLOW_SANDBOX_IMAGE) {
    return null;
  }

  const envPath = ensureEnvFromExample(projectRoot);
  const { keysWritten } = updateEnvKeys(envPath, updates);
  return { envPath, keysWritten };
}

export async function auditDeliveryImages(input: {
  /** Already-read confirmed release during an open operation. */
  release?: ManagerReleaseState | null;
  projectRoot: string;
  envMap: Map<string, string>;
  docker: DockerStatus;
  localDeliveryImagePair?: LocalDeliveryImagePair | null;
  imageExists?: (ref: string) => Promise<boolean>;
}): Promise<DeliveryImagesStatus> {
  const required = isDeliveryProfile(input.projectRoot);
  if (!required) {
    return {
      required: false,
      configured: false,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: false,
      sandboxPresent: false,
      ready: true,
    };
  }

  const config = resolveDeliveryImageConfig(input);
  const localPair =
    config || !input.docker.daemonRunning
      ? null
      : input.localDeliveryImagePair !== undefined
        ? input.localDeliveryImagePair
        : await findLocalDeliveryImagePair();
  const appImage = config?.appImage ?? localPair?.appImage ?? null;
  const sandboxImage = config?.sandboxImage ?? localPair?.sandboxImage ?? null;
  const configured = Boolean(config?.appImage && config?.sandboxImage);

  let appPresent = false;
  let sandboxPresent = false;
  if (input.docker.daemonRunning && configured) {
    const imageExists = input.imageExists ?? dockerImageExists;
    appPresent = await imageExists(appImage!);
    sandboxPresent = await imageExists(sandboxImage!);
  }

  return {
    required,
    configured,
    appImage,
    sandboxImage,
    releaseVersion: config?.releaseVersion ?? localPair?.releaseVersion ?? null,
    archiveSha256: config?.archiveSha256 || null,
    appPresent,
    sandboxPresent,
    ready: configured && appPresent && sandboxPresent,
  };
}

export type LoadDeliveryImagesDeps = {
  verifyReleaseArchiveSha256?: typeof verifyReleaseArchiveSha256;
  dockerLoadArchive?: typeof dockerLoadArchive;
  auditDeliveryImages?: typeof auditDeliveryImages;
  imageExists?: typeof dockerImageExists;
  inspectImage?: typeof inspectDockerImage;
  validateCompose?: (templatesRoot: string) => Promise<void>;
};

export type PreparePfinstallResult = {
  operation: InstallOperation;
  loadedImages: string[];
};

async function validatePreparedCompose(templatesRoot: string): Promise<void> {
  const envPath = path.join(templatesRoot, '.env');
  fs.copyFileSync(path.join(templatesRoot, '.env.example'), envPath);
  updateEnvKeys(envPath, {
    PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:validation',
    PRAXIS_FLOW_SANDBOX_IMAGE: 'praxis-flow/sandbox:validation',
    PRAXIS_FLOW_PROXY_IMAGE: PRAXIS_FLOW_PROXY_IMAGE_REF,
    MAINTENANCE_TOKEN: 'validation-maintenance-token',
    AUTH_KEY_CAPTIVE: 'validation-auth-key',
    SANDBOX_INTERNAL_TOKEN: 'validation-sandbox-token',
    SETUP_LAN_APP_IP: '127.0.0.1',
    SETUP_RESTRICTED_APP_IP: '127.0.0.2',
    PROXY_CADDY_DATA_HOST_PATH: path.join(templatesRoot, '.validation', 'caddy-data'),
    PROXY_CADDY_CONFIG_HOST_PATH: path.join(templatesRoot, '.validation', 'caddy-config'),
    PROXY_CADDYFILE_HOST_PATH: path.join(templatesRoot, 'proxy', 'Caddyfile'),
    PROXY_ACME_DNS_CREDENTIALS_HOST_PATH: path.join(templatesRoot, '.validation', 'acme.json'),
    PROXY_CERTS_HOST_PATH: path.join(templatesRoot, '.validation', 'certs'),
  });
  try {
    const result = await runDockerCommand(
      [
        'compose',
        '-f',
        'docker-compose.delivery.yml',
        '-f',
        'docker-compose.proxy.delivery.yml',
        '-f',
        'docker-compose.proxy-tls.delivery.yml',
        '-f',
        'docker-compose.proxy-restricted.delivery.yml',
        '--env-file',
        envPath,
        'config',
        '--quiet',
      ],
      { cwd: templatesRoot },
    );
    if (result.code !== 0) {
      throw new Error(`PFINSTALL_COMPOSE_INVALID: ${result.stderr || result.stdout}`);
    }
  } finally {
    fs.rmSync(envPath, { force: true });
  }
}

function validatePfinstallManifest(manifest: ReleaseManifest | null): ReleaseManifest {
  if (!manifest) throw new Error('PFINSTALL_MANIFEST_REQUIRED');
  const expectedApp = `praxis-flow/app:${manifest.version}`;
  const expectedSandbox = `praxis-flow/sandbox:${manifest.version}`;
  if (
    manifest.installFormatVersion !== 1 ||
    manifest.images?.app !== expectedApp ||
    manifest.images?.sandbox !== expectedSandbox ||
    manifest.images?.proxy !== PRAXIS_FLOW_PROXY_IMAGE_REF ||
    manifest.imageDigests?.proxy?.registryDigest?.toLowerCase() !==
      PRAXIS_FLOW_PROXY_IMAGE_REGISTRY_DIGEST
  ) {
    throw new Error('PFINSTALL_IMAGE_CONTRACT_INVALID');
  }
  return manifest;
}

export async function preparePfinstall(
  projectRoot: string,
  archivePath: string,
  mode: InstallMode,
  docker: DockerStatus,
  deps: LoadDeliveryImagesDeps = {},
): Promise<PreparePfinstallResult> {
  requirePackageFileExtension(archivePath, '.pfinstall');
  if (!docker.installed || !docker.daemonRunning || !docker.composeAvailable) {
    throw new Error('DOCKER_NOT_READY');
  }
  if (readInstallOperation(projectRoot)) throw new Error('INSTALL_OPERATION_ALREADY_ACTIVE');
  const resolvedArchive = path.resolve(archivePath);
  if (!fs.existsSync(resolvedArchive) || !fs.statSync(resolvedArchive).isFile()) {
    throw new Error('RELEASE_ARCHIVE_NOT_FOUND');
  }
  if (mode !== 'fresh' && mode !== 'replace') throw new Error('INSTALL_MODE_INVALID');

  const verifySha = deps.verifyReleaseArchiveSha256 ?? verifyReleaseArchiveSha256;
  const dockerLoad = deps.dockerLoadArchive ?? dockerLoadArchive;
  const imageExists = deps.imageExists ?? dockerImageExists;
  const inspectImage = deps.inspectImage ?? inspectDockerImage;
  const validateCompose = deps.validateCompose ?? validatePreparedCompose;
  const shaCheck = verifySha(resolvedArchive);
  const manifest = validatePfinstallManifest(shaCheck.manifest);
  const operationId = randomUUID();
  const operationDir = installOperationDirectory(projectRoot, operationId);
  fs.mkdirSync(operationDir, { recursive: true });
  const pinnedArchive = pinnedReleasePath(projectRoot, operationId);
  fs.copyFileSync(resolvedArchive, pinnedArchive);

  let loadedImages: string[] = [];
  let bundle: PreparedReleaseBundle | null = null;
  try {
    if (sha256File(pinnedArchive) !== shaCheck.sha256)
      throw new Error('PFINSTALL_PIN_DIGEST_MISMATCH');
    bundle = prepareReleaseBundle(pinnedArchive);
    await validateCompose(path.join(bundle.stagingDir!, 'templates'));
    const loadResult = await dockerLoad(bundle.dockerArchivePath);
    loadedImages = loadResult.loaded;
    if (!loadResult.ok) throw new Error(`DOCKER_LOAD_FAILED: ${loadResult.log || 'unknown error'}`);
    for (const ref of [manifest.images.app, manifest.images.sandbox, manifest.images.proxy]) {
      if (!loadResult.loaded.includes(ref))
        throw new Error(`PFINSTALL_EXPECTED_IMAGE_MISSING: ${ref}`);
    }
    if (
      !(await imageExists(manifest.images.app)) ||
      !(await imageExists(manifest.images.sandbox))
    ) {
      throw new Error('RELEASE_IMAGES_NOT_PRESENT_AFTER_LOAD');
    }
    const inspections = await inspectImagesForHostPlatform(
      [manifest.images.app, manifest.images.sandbox, manifest.images.proxy],
      inspectImage,
      'PFINSTALL_PLATFORM_MISMATCH',
    );
    const proxyInspection = inspections.get(manifest.images.proxy)!;
    if (
      proxyInspection.imageId !== manifest.imageDigests.proxy.archiveImageId.toLowerCase() ||
      proxyInspection.platform !== manifest.imageDigests.proxy.platform.toLowerCase()
    ) {
      throw new Error('PFINSTALL_PROXY_DIGEST_CONTRACT_INVALID');
    }
    const operation = createPreparedInstallOperation({
      home: projectRoot,
      mode,
      sha256: shaCheck.sha256,
      releaseVersion: manifest.version,
      id: operationId,
    });
    return { operation, loadedImages };
  } catch (error) {
    fs.rmSync(operationDir, { recursive: true, force: true });
    if (loadedImages.length > 0) {
      const message = error instanceof Error ? error.message : 'PFINSTALL_PREPARE_FAILED';
      throw new Error(`${message}; loaded Docker images were retained as unreferenced cache`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    if (bundle?.stagingDir) fs.rmSync(bundle.stagingDir, { recursive: true, force: true });
  }
}

export function activatePreparedPfinstall(
  projectRoot: string,
  operationId: string,
): LoadDeliveryImagesCoreResult {
  const operation = readInstallOperation(projectRoot);
  if (!operation || operation.id !== operationId) throw new Error('INSTALL_OPERATION_NOT_FOUND');
  if (operation.phase !== 'installing') throw new Error('INSTALL_OPERATION_NOT_COMMITTED');
  const archivePath = pinnedReleasePath(projectRoot, operation.id);
  if (sha256File(archivePath) !== operation.package.sha256)
    throw new Error('PFINSTALL_PIN_DIGEST_MISMATCH');
  const bundle = prepareReleaseBundle(archivePath);
  const hostSnapshot = snapshotHostFiles(projectRoot);
  try {
    installBundleTemplatesAtomically(projectRoot, bundle.stagingDir!);
    const envPath = ensureEnvFromExample(projectRoot);
    const appImage = `praxis-flow/app:${operation.package.releaseVersion}`;
    const sandboxImage = `praxis-flow/sandbox:${operation.package.releaseVersion}`;
    writeManagerReleaseState(projectRoot, {
      releaseVersion: operation.package.releaseVersion,
      appImage,
      sandboxImage,
      archiveSha256: operation.package.sha256,
    });
    writeDeliveryImageEnvFromState(projectRoot);
    updateEnvKeys(envPath, { [PRAXIS_FLOW_PROXY_IMAGE_ENV_KEY]: PRAXIS_FLOW_PROXY_IMAGE_REF });
    return {
      envPath,
      backupPath: null,
      loadedImages: [],
      appImage,
      sandboxImage,
      deliveryImages: {
        required: true,
        configured: true,
        appImage,
        sandboxImage,
        releaseVersion: operation.package.releaseVersion,
        archiveSha256: operation.package.sha256,
        appPresent: true,
        sandboxPresent: true,
        ready: true,
      },
      sha256Verified: true,
      sha256: operation.package.sha256,
      releaseVersion: operation.package.releaseVersion,
      sha256Source: 'manifest.json',
    };
  } catch (error) {
    restoreHostFiles(hostSnapshot);
    throw error;
  } finally {
    if (bundle.stagingDir) fs.rmSync(bundle.stagingDir, { recursive: true, force: true });
  }
}

export function extractPreparedPfinstallTemplates(
  projectRoot: string,
  operationId: string,
): { templatesRoot: string; cleanup: () => void } {
  const operation = readInstallOperation(projectRoot);
  if (!operation || operation.id !== operationId) throw new Error('INSTALL_OPERATION_NOT_FOUND');
  const archivePath = pinnedReleasePath(projectRoot, operation.id);
  if (sha256File(archivePath) !== operation.package.sha256)
    throw new Error('PFINSTALL_PIN_DIGEST_MISMATCH');
  const bundle = prepareReleaseBundle(archivePath);
  const templatesRoot = path.join(bundle.stagingDir!, 'templates');
  const envPath = path.join(templatesRoot, '.env');
  fs.copyFileSync(path.join(templatesRoot, '.env.example'), envPath);
  updateEnvKeys(envPath, {
    PRAXIS_FLOW_APP_IMAGE: `praxis-flow/app:${operation.package.releaseVersion}`,
    PRAXIS_FLOW_SANDBOX_IMAGE: `praxis-flow/sandbox:${operation.package.releaseVersion}`,
    MAINTENANCE_TOKEN: 'factory-reset-only',
    AUTH_KEY_CAPTIVE: 'factory-reset-only',
    SANDBOX_INTERNAL_TOKEN: 'factory-reset-only',
  });
  return {
    templatesRoot,
    cleanup: () => {
      if (bundle.stagingDir) fs.rmSync(bundle.stagingDir, { recursive: true, force: true });
    },
  };
}

type HostFileSnapshot = { path: string; content: Buffer | null };

function pfinstallHostPaths(projectRoot: string): string[] {
  return [
    ...RELEASE_BUNDLE_TEMPLATE_PATHS.map((entry) =>
      path.join(projectRoot, entry.replace(/^templates\//, '')),
    ),
    path.join(projectRoot, '.env'),
    managerStatePath(projectRoot),
  ];
}

function snapshotHostFiles(projectRoot: string): HostFileSnapshot[] {
  return pfinstallHostPaths(projectRoot).map((filePath) => ({
    path: filePath,
    content: fs.existsSync(filePath) ? fs.readFileSync(filePath) : null,
  }));
}

function restoreHostFiles(snapshot: HostFileSnapshot[]): void {
  for (const file of snapshot) {
    if (file.content === null) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      continue;
    }
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    const tempPath = `${file.path}.rollback-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, file.content);
    fs.renameSync(tempPath, file.path);
  }
}

function installBundleTemplatesAtomically(projectRoot: string, stagingDir: string): void {
  for (const relativePath of RELEASE_BUNDLE_TEMPLATE_PATHS) {
    const sourcePath = path.join(stagingDir, relativePath);
    const targetPath = path.join(projectRoot, relativePath.replace(/^templates\//, ''));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.pfinstall-${process.pid}-${Date.now()}`;
    try {
      fs.copyFileSync(sourcePath, tempPath);
      fs.renameSync(tempPath, targetPath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
}

function assertFreshInstallation(projectRoot: string): void {
  if (
    fs.existsSync(path.join(projectRoot, '.env')) ||
    fs.existsSync(managerStatePath(projectRoot))
  ) {
    throw new Error('PFINSTALL_EXISTING_INSTALLATION: use .pfupdate for an installed system');
  }
}

export async function loadDeliveryImagesFromArchive(
  projectRoot: string,
  archivePath: string,
  docker: DockerStatus,
  deps: LoadDeliveryImagesDeps = {},
): Promise<LoadDeliveryImagesCoreResult> {
  requirePackageFileExtension(archivePath, '.pfinstall');
  if (!docker.installed || !docker.daemonRunning) {
    throw new Error('DOCKER_NOT_READY');
  }

  const resolvedArchive = path.resolve(archivePath);
  if (!fs.existsSync(resolvedArchive) || !fs.statSync(resolvedArchive).isFile()) {
    throw new Error('RELEASE_ARCHIVE_NOT_FOUND');
  }

  assertFreshInstallation(projectRoot);

  const verifySha = deps.verifyReleaseArchiveSha256 ?? verifyReleaseArchiveSha256;
  const dockerLoad = deps.dockerLoadArchive ?? dockerLoadArchive;
  const auditImages = deps.auditDeliveryImages ?? auditDeliveryImages;
  const imageExists = deps.imageExists ?? dockerImageExists;
  const inspectImage = deps.inspectImage ?? inspectDockerImage;

  const shaCheck = verifySha(resolvedArchive);
  const manifest = shaCheck.manifest;
  if (!manifest) throw new Error('PFINSTALL_MANIFEST_REQUIRED');
  const expectedApp = `praxis-flow/app:${manifest.version}`;
  const expectedSandbox = `praxis-flow/sandbox:${manifest.version}`;
  if (
    manifest.installFormatVersion !== 1 ||
    manifest.images?.app !== expectedApp ||
    manifest.images?.sandbox !== expectedSandbox ||
    manifest.images?.proxy !== PRAXIS_FLOW_PROXY_IMAGE_REF ||
    manifest.imageDigests?.proxy?.registryDigest?.toLowerCase() !==
      PRAXIS_FLOW_PROXY_IMAGE_REGISTRY_DIGEST
  ) {
    throw new Error('PFINSTALL_IMAGE_CONTRACT_INVALID');
  }

  const bundle = prepareReleaseBundle(resolvedArchive);
  let loadedImages: string[] = [];
  try {
    const loadResult = await dockerLoad(bundle.dockerArchivePath);
    loadedImages = loadResult.loaded;
    if (!loadResult.ok) {
      throw new Error(`DOCKER_LOAD_FAILED: ${loadResult.log || 'unknown error'}`);
    }

    const appImage = manifest.images.app;
    const sandboxImage = manifest.images.sandbox;
    for (const ref of [appImage, sandboxImage, manifest.images.proxy]) {
      if (!loadResult.loaded.includes(ref)) {
        throw new Error(`PFINSTALL_EXPECTED_IMAGE_MISSING: ${ref}`);
      }
    }

    if (!(await imageExists(appImage)) || !(await imageExists(sandboxImage))) {
      throw new Error('RELEASE_IMAGES_NOT_PRESENT_AFTER_LOAD');
    }
    const inspections = await inspectImagesForHostPlatform(
      [appImage, sandboxImage, manifest.images.proxy],
      inspectImage,
      'PFINSTALL_PLATFORM_MISMATCH',
    );
    const proxyInspection = inspections.get(manifest.images.proxy)!;
    if (
      proxyInspection.imageId !== manifest.imageDigests?.proxy?.archiveImageId?.toLowerCase() ||
      proxyInspection.platform !== manifest.imageDigests?.proxy?.platform?.toLowerCase()
    ) {
      throw new Error('PFINSTALL_PROXY_DIGEST_CONTRACT_INVALID');
    }

    const hostSnapshot = snapshotHostFiles(projectRoot);
    try {
      installBundleTemplatesAtomically(projectRoot, bundle.stagingDir!);
      const envPathTarget = path.join(projectRoot, '.env');
      const envExistedBeforeImport = fs.existsSync(envPathTarget);
      const envPath = ensureEnvFromExample(projectRoot);
      let backupPath: string | null = null;
      if (envExistedBeforeImport) {
        backupPath = backupEnvFile(projectRoot).backupPath;
      }

      writeManagerReleaseState(projectRoot, {
        releaseVersion: shaCheck.releaseVersion,
        appImage,
        sandboxImage,
        archiveSha256: shaCheck.sha256,
      });
      writeDeliveryImageEnvFromState(projectRoot);

      const loadedProxyImage = pickLoadedProxyImageRef(loadResult.loaded);
      if (loadedProxyImage) {
        updateEnvKeys(envPath, {
          [PRAXIS_FLOW_PROXY_IMAGE_ENV_KEY]: loadedProxyImage,
        });
      }

      const envMap = readEnvMap(envPath);
      const deliveryImages = await auditImages({ projectRoot, envMap, docker });
      if (!deliveryImages.ready) {
        throw new Error('RELEASE_IMAGE_AUDIT_FAILED');
      }

      return {
        envPath,
        backupPath,
        loadedImages: loadResult.loaded,
        appImage,
        sandboxImage,
        deliveryImages,
        sha256Verified: true,
        sha256: shaCheck.sha256,
        releaseVersion: shaCheck.releaseVersion,
        sha256Source: shaCheck.sha256Source,
      };
    } catch (error) {
      restoreHostFiles(hostSnapshot);
      throw error;
    }
  } catch (error) {
    if (loadedImages.length > 0) {
      const message = error instanceof Error ? error.message : 'PFINSTALL_FAILED';
      throw new Error(`${message}; loaded Docker images were retained as unreferenced cache`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    if (bundle.stagingDir) {
      fs.rmSync(bundle.stagingDir, { recursive: true, force: true });
    }
  }
}
