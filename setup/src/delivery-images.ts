import { ManagerApiError } from '@wartezimmer/server-shared/setup-api';
import { replaceFile } from './maintenance-files.js';
import { archiveTool } from './pfupdate-package.js';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  WARTEZIMMER_PROXY_IMAGE_ENV_KEY,
  WARTEZIMMER_PROXY_IMAGE_REF,
  WARTEZIMMER_PROXY_IMAGE_REGISTRY_DIGEST,
  type DeliveryImagesStatus,
} from '@wartezimmer/server-shared';
import type { DockerStatus } from './docker.js';
import { runDockerCommand } from './docker-cli.js';
import { updateEnvKeys } from './env-file.js';
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

export type { DeliveryImagesStatus } from '@wartezimmer/server-shared';

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
  sha256Source: 'manifest.json';
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

export function classifyWartezimmerImages(refs: string[]): {
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
    if (lower.includes('/app') || lower.includes('-app') || lower.includes('wartezimmer/app')) {
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
      Boolean(ref && ref.repository === 'wartezimmer/app'),
    );
  const sandboxImages = refs
    .map(parseImageRef)
    .filter((ref): ref is NonNullable<ReturnType<typeof parseImageRef>> =>
      Boolean(ref && ref.repository === 'wartezimmer/sandbox'),
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
  manifest: ReleaseManifest;
};

type ReleaseManifest = {
  installFormatVersion: 2;
  version: string;
  platform?: string;
  images: { app: string; sandbox: string; proxy: string };
  imageDigests: {
    proxy: { registryDigest: string; archiveImageId: string; platform: string };
  };
};

export type DockerImageInspection = { imageId: string; platform: string };

export function hostDockerPlatform(arch = process.arch): string {
  return `linux/${arch === 'x64' ? 'amd64' : arch}`;
}

export async function detectDockerPlatform(run = runDockerCommand): Promise<string> {
  const result = await run(['info', '--format', '{{.OSType}}/{{.Architecture}}'], {
    timeoutMs: 5_000,
  });
  const normalized = result.stdout
    .trim()
    .toLowerCase()
    .replace(/\/x86_64$/, '/amd64')
    .replace(/\/aarch64$/, '/arm64');
  if (result.code !== 0 || !['linux/amd64', 'linux/arm64'].includes(normalized)) {
    throw releaseValidationError(
      'DOCKER_PLATFORM_UNSUPPORTED',
      'Die Docker-Architektur konnte nicht als Linux AMD64 oder ARM64 erkannt werden. Bitte Docker Desktop im Linux-Containerbetrieb starten und erneut prüfen.',
    );
  }
  return normalized;
}

export function assertPackagePlatform(
  actual: string,
  expected: string,
  code = 'PFINSTALL_PLATFORM_MISMATCH',
): void {
  if (actual.toLowerCase() === expected) return;
  const label = (platform: string) =>
    platform === 'linux/amd64'
      ? 'AMD64 (Intel/AMD, x64)'
      : platform === 'linux/arm64'
        ? 'ARM64 (Apple Silicon/Snapdragon)'
        : platform;
  const suffix = expected.split('/')[1];
  throw releaseValidationError(
    code,
    `Falsche Architektur gewählt: Dieses Paket ist für ${label(actual)}. Ihre Docker-Engine benötigt ${label(expected)}. Bitte das Paket mit „linux-${suffix}“ im Dateinamen auswählen.`,
  );
}

export async function inspectImagesForHostPlatform(
  refs: readonly string[],
  inspectImage: (ref: string) => Promise<DockerImageInspection> = inspectDockerImage,
  errorCode = 'DOCKER_IMAGE_PLATFORM_MISMATCH',
  expected = hostDockerPlatform(),
): Promise<Map<string, DockerImageInspection>> {
  const inspections = await Promise.all(
    refs.map(async (ref) => [ref, await inspectImage(ref)] as const),
  );
  for (const [, inspection] of inspections) {
    assertPackagePlatform(inspection.platform, expected, errorCode);
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
  const entries = (() => {
    try {
      const result = listTarArchiveEntriesVerbose(archivePath);
      validateTarArchiveEntries(result);
      return result;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message.split(':')[0] : 'TAR_INVALID';
      throw releaseValidationError(
        'PFINSTALL_ARCHIVE_INVALID',
        `Das Installationspaket ist beschädigt oder enthält unzulässige Archiv-Einträge (${detail}). Bitte die .pfinstall-Datei erneut beziehen.`,
      );
    }
  })();
  const dockerArchive = 'images/wartezimmer-images.tar';
  if (!entries.some((entry) => entry.name === 'manifest.json')) {
    throw releaseValidationError(
      'PFINSTALL_MANIFEST_REQUIRED',
      'Das Installationspaket enthält kein internes Manifest. Das alte Paketformat wird nicht mehr unterstützt. Bitte die .pfinstall-Datei mit dem aktuellen Build-Script neu erstellen.',
    );
  }
  const payloadFiles = [
    dockerArchive,
    ...RELEASE_BUNDLE_TEMPLATE_PATHS,
    'THIRD_PARTY_NOTICES.txt',
    'licenses/caddy/LICENSE.txt',
  ];
  // License-bearing releases and earlier format-2 packages share the same reader.
  if (entries.some((entry) => entry.name === 'LICENSE')) payloadFiles.push('LICENSE');
  const allowedFiles = new Set<string>([...payloadFiles, 'manifest.json']);
  for (const entry of entries) {
    if (!entry.name) continue;
    const allowed =
      entry.type === 'file'
        ? allowedFiles.has(entry.name)
        : [...allowedFiles].some((file) => file.startsWith(`${entry.name}/`));
    if (!allowed)
      throw releaseValidationError(
        'PFINSTALL_TAR_ENTRY_UNEXPECTED',
        'Das Installationspaket enthält unerwartete Dateien. Bitte ein passendes Paket und einen aktuellen Manager verwenden.',
      );
  }
  if (!entries.some((entry) => entry.name === dockerArchive)) {
    throw new Error('RELEASE_BUNDLE_UNSUPPORTED');
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wartezimmer-release-'));
  const extracted = spawnSync(archiveTool(), ['-xzf', archivePath, '-C', stagingDir], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (extracted.status !== 0) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw releaseValidationError(
      'PFINSTALL_EXTRACT_FAILED',
      'Das Installationspaket kann nicht entpackt werden. Bitte freien Speicherplatz und Zugriffsrechte prüfen und die .pfinstall-Datei erneut kopieren.',
    );
  }

  try {
    for (const relativePath of RELEASE_BUNDLE_TEMPLATE_PATHS) {
      try {
        assertRegularFileInStaging(stagingDir, relativePath);
      } catch {
        throw releaseValidationError(
          'PFINSTALL_CONTENT_MISMATCH',
          `Das Installationspaket ist unvollständig (${relativePath}). Bitte die .pfinstall-Datei erneut beziehen.`,
        );
      }
    }
    assertRegularFileInStaging(stagingDir, dockerArchive);
    const manifest = validateEmbeddedManifest(stagingDir, payloadFiles);
    return { dockerArchivePath: path.join(stagingDir, dockerArchive), stagingDir, manifest };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function validateEmbeddedManifest(root: string, payloadFiles: string[]): ReleaseManifest {
  const invalid = () =>
    releaseValidationError(
      'PFINSTALL_MANIFEST_INVALID',
      'Das interne Manifest des Installationspakets fehlt, ist beschädigt oder hat ein nicht unterstütztes Format. Bitte das Paket erneut beziehen und einen aktuellen Manager verwenden.',
    );
  let parsed: unknown;
  try {
    assertRegularFileInStaging(root, 'manifest.json');
    const manifestPath = path.join(root, 'manifest.json');
    if (fs.statSync(manifestPath).size > 1024 * 1024) throw invalid();
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw invalid();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid();
  const manifest = parsed as ReleaseManifest & { files?: Record<string, unknown> };
  if (
    manifest.installFormatVersion !== 2 ||
    !manifest.files ||
    typeof manifest.files !== 'object' ||
    Array.isArray(manifest.files) ||
    Object.keys(manifest.files).length !== payloadFiles.length ||
    !payloadFiles.every((file) => Object.hasOwn(manifest.files!, file))
  )
    throw invalid();
  validatePfinstallManifest(manifest);
  for (const file of payloadFiles) {
    const checksum = manifest.files[file];
    if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(checksum)) throw invalid();
    try {
      assertRegularFileInStaging(root, file);
      if (sha256File(path.join(root, file)) !== checksum.toLowerCase()) throw new Error('digest');
    } catch {
      throw releaseValidationError(
        'PFINSTALL_CONTENT_MISMATCH',
        `Das Installationspaket ist unvollständig oder beschädigt (${file}). Bitte die .pfinstall-Datei erneut kopieren oder herunterladen.`,
      );
    }
  }
  return manifest;
}

function releaseValidationError(code: string, message: string): ManagerApiError {
  return new ManagerApiError({ code, category: 'validation', message, retryable: false });
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

  const appImage = input.envMap.get('WARTEZIMMER_APP_IMAGE')?.trim() || null;
  const sandboxImage = input.envMap.get('WARTEZIMMER_SANDBOX_IMAGE')?.trim() || null;
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
  if (!updates.WARTEZIMMER_APP_IMAGE || !updates.WARTEZIMMER_SANDBOX_IMAGE) {
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
  dockerLoadArchive?: typeof dockerLoadArchive;
  imageExists?: typeof dockerImageExists;
  inspectImage?: typeof inspectDockerImage;
  validateCompose?: (templatesRoot: string) => Promise<void>;
  detectDockerPlatform?: typeof detectDockerPlatform;
};

export type PreparePfinstallResult = {
  operation: InstallOperation;
  loadedImages: string[];
};

async function validatePreparedCompose(templatesRoot: string): Promise<void> {
  const envPath = path.join(templatesRoot, '.env');
  fs.copyFileSync(path.join(templatesRoot, '.env.example'), envPath);
  updateEnvKeys(envPath, {
    WARTEZIMMER_APP_IMAGE: 'wartezimmer/app:validation',
    WARTEZIMMER_SANDBOX_IMAGE: 'wartezimmer/sandbox:validation',
    WARTEZIMMER_PROXY_IMAGE: WARTEZIMMER_PROXY_IMAGE_REF,
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

function validatePfinstallManifest(manifest: ReleaseManifest): ReleaseManifest {
  const expectedApp = `wartezimmer/app:${manifest.version}`;
  const expectedSandbox = `wartezimmer/sandbox:${manifest.version}`;
  if (
    manifest.installFormatVersion !== 2 ||
    (manifest.platform !== undefined &&
      !['linux/amd64', 'linux/arm64'].includes(manifest.platform)) ||
    typeof manifest.version !== 'string' ||
    !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(manifest.version) ||
    typeof manifest.imageDigests?.proxy?.registryDigest !== 'string' ||
    typeof manifest.imageDigests?.proxy?.archiveImageId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/i.test(manifest.imageDigests.proxy.archiveImageId) ||
    typeof manifest.imageDigests?.proxy?.platform !== 'string' ||
    manifest.images?.app !== expectedApp ||
    manifest.images?.sandbox !== expectedSandbox ||
    manifest.images?.proxy !== WARTEZIMMER_PROXY_IMAGE_REF ||
    manifest.imageDigests?.proxy?.registryDigest?.toLowerCase() !==
      WARTEZIMMER_PROXY_IMAGE_REGISTRY_DIGEST
  ) {
    throw releaseValidationError(
      'PFINSTALL_IMAGE_CONTRACT_INVALID',
      'Das Installationspaket enthält ungültige oder inkompatible Image-Metadaten. Bitte ein passendes Paket und einen aktuellen Manager verwenden.',
    );
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
  if (mode === 'fresh') assertFreshInstallation(projectRoot);

  const dockerLoad = deps.dockerLoadArchive ?? dockerLoadArchive;
  const imageExists = deps.imageExists ?? dockerImageExists;
  const inspectImage = deps.inspectImage ?? inspectDockerImage;
  const validateCompose = deps.validateCompose ?? validatePreparedCompose;
  const archiveSha256 = sha256File(resolvedArchive);
  const operationId = randomUUID();
  const operationDir = installOperationDirectory(projectRoot, operationId);
  fs.mkdirSync(operationDir, { recursive: true });
  const pinnedArchive = pinnedReleasePath(projectRoot, operationId);

  let loadedImages: string[] = [];
  let bundle: PreparedReleaseBundle | null = null;
  try {
    fs.copyFileSync(resolvedArchive, pinnedArchive);
    if (sha256File(pinnedArchive) !== archiveSha256)
      throw new Error('PFINSTALL_PIN_DIGEST_MISMATCH');
    bundle = prepareReleaseBundle(pinnedArchive);
    const manifest = bundle.manifest;
    const expectedPlatform = await (deps.detectDockerPlatform ?? detectDockerPlatform)();
    assertPackagePlatform(
      manifest.platform ?? manifest.imageDigests.proxy.platform,
      expectedPlatform,
    );
    assertPackagePlatform(manifest.imageDigests.proxy.platform, expectedPlatform);
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
      expectedPlatform,
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
      sha256: archiveSha256,
      releaseVersion: manifest.version,
      id: operationId,
    });
    return { operation, loadedImages };
  } catch (error) {
    fs.rmSync(operationDir, { recursive: true, force: true });
    if (error instanceof ManagerApiError) throw error;
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
    const appImage = `wartezimmer/app:${operation.package.releaseVersion}`;
    const sandboxImage = `wartezimmer/sandbox:${operation.package.releaseVersion}`;
    writeManagerReleaseState(projectRoot, {
      releaseVersion: operation.package.releaseVersion,
      appImage,
      sandboxImage,
      archiveSha256: operation.package.sha256,
    });
    writeDeliveryImageEnvFromState(projectRoot);
    updateEnvKeys(envPath, { [WARTEZIMMER_PROXY_IMAGE_ENV_KEY]: WARTEZIMMER_PROXY_IMAGE_REF });
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
    WARTEZIMMER_APP_IMAGE: `wartezimmer/app:${operation.package.releaseVersion}`,
    WARTEZIMMER_SANDBOX_IMAGE: `wartezimmer/sandbox:${operation.package.releaseVersion}`,
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
    replaceFile(tempPath, file.path);
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
      replaceFile(tempPath, targetPath);
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
