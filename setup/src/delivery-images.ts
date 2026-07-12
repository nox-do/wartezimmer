import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DeliveryImagesStatus } from '@praxis-flow/server-shared';
import type { DockerStatus } from './docker.js';
import { runDockerCommand } from './docker-cli.js';
import { backupEnvFile, readEnvMap, updateEnvKeys } from './env-file.js';
import {
  readManagerState,
  releaseEnvFromManagerState,
  writeManagerReleaseState,
  type ManagerReleaseState,
} from './manager-state.js';

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

export function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toLowerCase();
}

export function readExpectedSha256ForArchive(archivePath: string): {
  expectedSha256: string;
  source: 'manifest.json' | 'SHA256SUMS.txt';
  releaseVersion: string | null;
} {
  const dir = path.dirname(archivePath);
  const fileName = path.basename(archivePath);

  const manifestPath = path.join(dir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      sha256?: string;
      version?: string;
      archive?: string;
    };
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
  projectRoot: string;
  envMap: Map<string, string>;
}): ManagerReleaseState | null {
  const release = readManagerState(input.projectRoot).release;
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

export async function loadDeliveryImagesFromArchive(
  projectRoot: string,
  archivePath: string,
  docker: DockerStatus,
): Promise<LoadDeliveryImagesCoreResult> {
  if (!docker.installed || !docker.daemonRunning) {
    throw new Error('DOCKER_NOT_READY');
  }

  const resolvedArchive = path.resolve(archivePath);
  if (!fs.existsSync(resolvedArchive) || !fs.statSync(resolvedArchive).isFile()) {
    throw new Error('RELEASE_ARCHIVE_NOT_FOUND');
  }

  const shaCheck = verifyReleaseArchiveSha256(resolvedArchive);

  const loadResult = await dockerLoadArchive(resolvedArchive);
  if (!loadResult.ok) {
    throw new Error(`DOCKER_LOAD_FAILED: ${loadResult.log || 'unknown error'}`);
  }

  const { appImage, sandboxImage } = classifyPraxisFlowImages(loadResult.loaded);
  if (!appImage || !sandboxImage) {
    throw new Error(
      `RELEASE_IMAGES_UNRECOGNIZED: expected app + sandbox images, got ${loadResult.loaded.join(', ')}`,
    );
  }

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

  const envMap = readEnvMap(envPath);
  const deliveryImages = await auditDeliveryImages({ projectRoot, envMap, docker });

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
}
