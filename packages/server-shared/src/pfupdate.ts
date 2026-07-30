import { createHash } from 'node:crypto';
import { stableJsonStringify } from './pfbackup.js';

export const PFUPDATE_FORMAT_VERSION = 1 as const;
export const PFUPDATE_FILE_EXTENSION = 'pfupdate';
export const PFUPDATE_BASENAME_PREFIX = 'praxis-flow-update-';

export const PFUPDATE_IMAGES_TAR_PATH = 'images/praxis-flow-images.tar';

/** Pinned offline reverse-proxy image shipped in release/.pfupdate packages (optional at runtime). */
export const PRAXIS_FLOW_PROXY_IMAGE_REF = 'caddy:2.11.4' as const;
export const PRAXIS_FLOW_PROXY_IMAGE_ENV_KEY = 'PRAXIS_FLOW_PROXY_IMAGE' as const;

export const PFUPDATE_TEMPLATE_PATHS = [
  'templates/docker-compose.delivery.yml',
  'templates/.env.example',
] as const;

/** Optional openNDS gateway compose (lab / legacy packages). Not part of product releases. */
export const PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS = [
  'templates/docker-compose.gateway.delivery.yml',
] as const;

/** Optional in v1 for backward compatibility with packages built before P2c. */
export const PFUPDATE_OPTIONAL_PROXY_TEMPLATE_PATHS = [
  'templates/docker-compose.proxy.delivery.yml',
  'templates/proxy/Caddyfile',
] as const;

export const PFUPDATE_REQUIRED_FILE_PATHS = [
  PFUPDATE_IMAGES_TAR_PATH,
  ...PFUPDATE_TEMPLATE_PATHS,
] as const;

export const PFUPDATE_ALLOWED_FILE_PATHS = [
  ...PFUPDATE_REQUIRED_FILE_PATHS,
  ...PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS,
  ...PFUPDATE_OPTIONAL_PROXY_TEMPLATE_PATHS,
] as const;

export type PfupdateTemplatePath = (typeof PFUPDATE_TEMPLATE_PATHS)[number];
export type PfupdateOptionalGatewayTemplatePath =
  (typeof PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS)[number];
export type PfupdateOptionalProxyTemplatePath =
  (typeof PFUPDATE_OPTIONAL_PROXY_TEMPLATE_PATHS)[number];
export type PfupdateRequiredFilePath = (typeof PFUPDATE_REQUIRED_FILE_PATHS)[number];
export type PfupdateAllowedFilePath = (typeof PFUPDATE_ALLOWED_FILE_PATHS)[number];

export type PfupdateFileEntryV1 = {
  path: PfupdateAllowedFilePath;
  sha256: string;
  byteLength: number;
};

export type PfupdateImagesV1 = {
  app: string;
  sandbox: string;
  /** Present in lab/legacy packages that ship openNDS; omitted from product releases. */
  gateway?: string;
  /** Present in packages that ship the offline Caddy image; omitted in older v1 packages. */
  proxy?: string;
};

export type PfupdateManifestV1 = {
  updateFormatVersion: typeof PFUPDATE_FORMAT_VERSION;
  releaseVersion: string;
  createdAt: string;
  minimumManagerVersion: string;
  supportedSettingsFormatVersions: number[];
  targetSchemaVersion: number;
  images: PfupdateImagesV1;
  files: PfupdateFileEntryV1[];
};

export type PfupdateFileDigest = {
  sha256: string;
  byteLength: number;
};

export type PfupdateCompatibilityInput = {
  managerVersion?: string | null;
  settingsFormatVersion?: number | null;
};

export type PfupdateCompatibilityResult = {
  packageValid: boolean;
  managerCompatible: boolean;
  settingsCompatible: boolean;
  warnings: string[];
};

export type PfupdateValidationResult = {
  ok: boolean;
  errors: string[];
  manifest?: PfupdateManifestV1;
  compatibility?: PfupdateCompatibilityResult;
};

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;
const VERSIONED_IMAGE_REPO_BY_KEY = {
  app: 'praxis-flow/app',
  sandbox: 'praxis-flow/sandbox',
  gateway: 'praxis-flow/gateway',
} as const;

type PfupdateVersionedImageKey = keyof typeof VERSIONED_IMAGE_REPO_BY_KEY;

/** Always required in v1 manifests. */
const REQUIRED_VERSIONED_IMAGE_KEYS = [
  'app',
  'sandbox',
] as const satisfies readonly PfupdateVersionedImageKey[];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isPfupdateRelativePath(path: string): boolean {
  if (!path || path.includes('\\') || path.startsWith('/')) {
    return false;
  }
  const segments = path.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function compareSemver(left: string, right: string): -1 | 0 | 1 {
  const parse = (value: string) => {
    const match = value.trim().match(SEMVER_PATTERN);
    if (!match) {
      return null;
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  };

  const a = parse(left);
  const b = parse(right);
  if (!a || !b) {
    throw new Error('PFUPDATE_INVALID_SEMVER');
  }

  for (let index = 0; index < 3; index += 1) {
    if (a[index] < b[index]) {
      return -1;
    }
    if (a[index] > b[index]) {
      return 1;
    }
  }
  return 0;
}

export function isManagerVersionCompatible(
  managerVersion: string,
  minimumManagerVersion: string,
): boolean {
  try {
    return compareSemver(managerVersion, minimumManagerVersion) >= 0;
  } catch {
    return false;
  }
}

export function buildPfupdateFilename(releaseVersion: string): string {
  return `${PFUPDATE_BASENAME_PREFIX}${releaseVersion}.${PFUPDATE_FILE_EXTENSION}`;
}

export function expectedPfupdateImageRef(
  repository: (typeof VERSIONED_IMAGE_REPO_BY_KEY)[PfupdateVersionedImageKey],
  releaseVersion: string,
): string {
  return `${repository}:${releaseVersion}`;
}

export function buildPfupdateManifest(input: {
  releaseVersion: string;
  images: PfupdateImagesV1;
  files: PfupdateFileEntryV1[];
  createdAt?: string;
  minimumManagerVersion?: string;
  supportedSettingsFormatVersions?: number[];
  targetSchemaVersion?: number;
}): PfupdateManifestV1 {
  const images: PfupdateImagesV1 = {
    app: input.images.app.trim(),
    sandbox: input.images.sandbox.trim(),
  };
  if (input.images.gateway !== undefined) {
    images.gateway = input.images.gateway.trim();
  }
  if (input.images.proxy !== undefined) {
    images.proxy = input.images.proxy.trim();
  }
  return {
    updateFormatVersion: PFUPDATE_FORMAT_VERSION,
    releaseVersion: input.releaseVersion.trim(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    minimumManagerVersion: input.minimumManagerVersion ?? '0.2.0',
    supportedSettingsFormatVersions: input.supportedSettingsFormatVersions ?? [1],
    targetSchemaVersion: input.targetSchemaVersion ?? 1,
    images,
    files: input.files.map((entry) => ({
      path: entry.path,
      sha256: entry.sha256.trim().toLowerCase(),
      byteLength: entry.byteLength,
    })),
  };
}

export function serializePfupdateManifest(manifest: PfupdateManifestV1): string {
  return stableJsonStringify(manifest);
}

export function parseSha256Sums(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    entries.set(match[2].trim(), match[1].trim().toLowerCase());
  }
  return entries;
}

export function formatSha256Sums(entries: Array<{ path: string; sha256: string }>): string {
  const lines = entries.map(({ path, sha256 }) => `${sha256.toLowerCase()}  ${path}`);
  return `${lines.join('\n')}\n`;
}

function validateManifestObject(raw: unknown): { manifest?: PfupdateManifestV1; errors: string[] } {
  const errors: string[] = [];

  if (!isPlainObject(raw)) {
    return { errors: ['manifest.json muss ein Objekt sein.'] };
  }

  const record = raw;
  const allowedTopLevel = new Set([
    'updateFormatVersion',
    'releaseVersion',
    'createdAt',
    'minimumManagerVersion',
    'supportedSettingsFormatVersions',
    'targetSchemaVersion',
    'images',
    'files',
  ]);

  for (const key of Object.keys(record)) {
    if (!allowedTopLevel.has(key)) {
      errors.push(`manifest.json: Unbekanntes Feld "${key}".`);
    }
  }

  if (record.updateFormatVersion !== PFUPDATE_FORMAT_VERSION) {
    errors.push(
      `Nicht unterstützte Update-Version ${String(record.updateFormatVersion)} (erwartet ${PFUPDATE_FORMAT_VERSION}).`,
    );
  }

  if (
    !isNonEmptyString(record.releaseVersion) ||
    !RELEASE_VERSION_PATTERN.test(record.releaseVersion.trim())
  ) {
    errors.push('manifest.json: releaseVersion fehlt oder ist ungültig.');
  }

  if (!isNonEmptyString(record.createdAt)) {
    errors.push('manifest.json: createdAt fehlt.');
  } else if (Number.isNaN(Date.parse(record.createdAt))) {
    errors.push('manifest.json: createdAt ist kein gültiger ISO-Zeitstempel.');
  }

  if (!isNonEmptyString(record.minimumManagerVersion)) {
    errors.push('manifest.json: minimumManagerVersion fehlt.');
  } else if (!SEMVER_PATTERN.test(record.minimumManagerVersion.trim())) {
    errors.push('manifest.json: minimumManagerVersion ist keine gültige Semver-Angabe.');
  }

  if (
    !Array.isArray(record.supportedSettingsFormatVersions) ||
    record.supportedSettingsFormatVersions.length === 0
  ) {
    errors.push('manifest.json: supportedSettingsFormatVersions muss ein nicht-leeres Array sein.');
  } else if (
    !record.supportedSettingsFormatVersions.every(
      (value) => typeof value === 'number' && Number.isInteger(value) && value > 0,
    )
  ) {
    errors.push('manifest.json: supportedSettingsFormatVersions enthält ungültige Werte.');
  }

  if (
    typeof record.targetSchemaVersion !== 'number' ||
    !Number.isInteger(record.targetSchemaVersion) ||
    record.targetSchemaVersion <= 0
  ) {
    errors.push('manifest.json: targetSchemaVersion muss eine positive Ganzzahl sein.');
  }

  if (!isPlainObject(record.images)) {
    errors.push('manifest.json: images fehlt oder ist kein Objekt.');
  } else {
    for (const key of Object.keys(record.images)) {
      if (key !== 'proxy' && !(key in VERSIONED_IMAGE_REPO_BY_KEY)) {
        errors.push(`manifest.json: Unbekanntes images-Feld "${key}".`);
      }
    }
    for (const key of REQUIRED_VERSIONED_IMAGE_KEYS) {
      const value = record.images[key];
      if (!isNonEmptyString(value)) {
        errors.push(`manifest.json: images.${key} fehlt oder ist leer.`);
      }
    }
    if (record.images.gateway !== undefined && !isNonEmptyString(record.images.gateway)) {
      errors.push('manifest.json: images.gateway muss ein nicht-leerer String sein, wenn gesetzt.');
    }
    if (record.images.proxy !== undefined && !isNonEmptyString(record.images.proxy)) {
      errors.push('manifest.json: images.proxy muss ein nicht-leerer String sein, wenn gesetzt.');
    }
  }

  if (!Array.isArray(record.files)) {
    errors.push('manifest.json: files muss ein Array sein.');
  }

  if (errors.length > 0) {
    return { errors };
  }

  const imagesRaw = record.images as PfupdateImagesV1;
  const images: PfupdateImagesV1 = {
    app: imagesRaw.app.trim(),
    sandbox: imagesRaw.sandbox.trim(),
  };
  if (isNonEmptyString(imagesRaw.gateway)) {
    images.gateway = imagesRaw.gateway.trim();
  }
  if (isNonEmptyString(imagesRaw.proxy)) {
    images.proxy = imagesRaw.proxy.trim();
  }

  const manifest: PfupdateManifestV1 = {
    updateFormatVersion: PFUPDATE_FORMAT_VERSION,
    releaseVersion: (record.releaseVersion as string).trim(),
    createdAt: (record.createdAt as string).trim(),
    minimumManagerVersion: (record.minimumManagerVersion as string).trim(),
    supportedSettingsFormatVersions: [...(record.supportedSettingsFormatVersions as number[])],
    targetSchemaVersion: record.targetSchemaVersion as number,
    images,
    files: [],
  };

  const fileErrors = validatePfupdateFileEntries(manifest, record.files);
  if (fileErrors.length > 0) {
    return { errors: fileErrors };
  }

  manifest.files = (record.files as PfupdateFileEntryV1[]).map((entry) => ({
    path: entry.path,
    sha256: entry.sha256.trim().toLowerCase(),
    byteLength: entry.byteLength,
  }));

  const imageErrors = validatePfupdateImageRefs(manifest);
  if (imageErrors.length > 0) {
    return { errors: imageErrors };
  }

  return { manifest, errors: [] };
}

export function validatePfupdateFileEntries(
  manifest: Pick<PfupdateManifestV1, 'releaseVersion'>,
  filesRaw: unknown,
): string[] {
  const errors: string[] = [];

  if (!Array.isArray(filesRaw)) {
    return ['manifest.json: files muss ein Array sein.'];
  }

  const seen = new Set<string>();
  for (const [index, entryRaw] of filesRaw.entries()) {
    if (!isPlainObject(entryRaw)) {
      errors.push(`manifest.json: files[${index}] muss ein Objekt sein.`);
      continue;
    }

    const pathValue = entryRaw.path;
    if (!isNonEmptyString(pathValue) || !isPfupdateRelativePath(pathValue)) {
      errors.push(`manifest.json: files[${index}].path ist ungültig.`);
      continue;
    }

    if (!PFUPDATE_ALLOWED_FILE_PATHS.includes(pathValue as PfupdateAllowedFilePath)) {
      errors.push(`manifest.json: files[${index}].path "${pathValue}" ist nicht erlaubt.`);
    }

    if (seen.has(pathValue)) {
      errors.push(`manifest.json: doppelter Dateipfad "${pathValue}".`);
    }
    seen.add(pathValue);

    if (
      !isNonEmptyString(entryRaw.sha256) ||
      !SHA256_PATTERN.test(entryRaw.sha256.trim().toLowerCase())
    ) {
      errors.push(`manifest.json: files[${index}].sha256 ist ungültig.`);
    }

    if (
      typeof entryRaw.byteLength !== 'number' ||
      !Number.isInteger(entryRaw.byteLength) ||
      entryRaw.byteLength < 0
    ) {
      errors.push(`manifest.json: files[${index}].byteLength ist ungültig.`);
    }
  }

  for (const requiredPath of PFUPDATE_REQUIRED_FILE_PATHS) {
    if (!seen.has(requiredPath)) {
      errors.push(`manifest.json: Pflichtdatei "${requiredPath}" fehlt in files.`);
    }
  }

  return errors;
}

export function validatePfupdateImageRefs(manifest: PfupdateManifestV1): string[] {
  const errors: string[] = [];
  const releaseVersion = manifest.releaseVersion;

  for (const key of REQUIRED_VERSIONED_IMAGE_KEYS) {
    const expected = expectedPfupdateImageRef(VERSIONED_IMAGE_REPO_BY_KEY[key], releaseVersion);
    const actual = manifest.images[key];
    if (actual !== expected) {
      errors.push(`manifest.json: images.${key} muss "${expected}" sein (ist "${actual}").`);
    }
  }

  if (manifest.images.gateway !== undefined) {
    const expectedGateway = expectedPfupdateImageRef(
      VERSIONED_IMAGE_REPO_BY_KEY.gateway,
      releaseVersion,
    );
    if (manifest.images.gateway !== expectedGateway) {
      errors.push(
        `manifest.json: images.gateway muss "${expectedGateway}" sein (ist "${manifest.images.gateway}").`,
      );
    }
    for (const templatePath of PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS) {
      if (!manifest.files.some((entry) => entry.path === templatePath)) {
        errors.push(
          `manifest.json: Pflichtdatei "${templatePath}" fehlt in files, wenn images.gateway gesetzt ist.`,
        );
      }
    }
  }

  if (manifest.images.proxy !== undefined) {
    if (manifest.images.proxy !== PRAXIS_FLOW_PROXY_IMAGE_REF) {
      errors.push(
        `manifest.json: images.proxy muss "${PRAXIS_FLOW_PROXY_IMAGE_REF}" sein (ist "${manifest.images.proxy}").`,
      );
    }
    for (const templatePath of PFUPDATE_OPTIONAL_PROXY_TEMPLATE_PATHS) {
      if (!manifest.files.some((entry) => entry.path === templatePath)) {
        errors.push(
          `manifest.json: Pflichtdatei "${templatePath}" fehlt in files, wenn images.proxy gesetzt ist.`,
        );
      }
    }
  }

  return errors;
}

export function validatePfupdateFileDigests(
  manifest: PfupdateManifestV1,
  files: Record<string, PfupdateFileDigest | undefined>,
): string[] {
  const errors: string[] = [];

  for (const entry of manifest.files) {
    const actual = files[entry.path];
    if (!actual) {
      errors.push(`Datei "${entry.path}" fehlt im Paket.`);
      continue;
    }

    if (actual.sha256.trim().toLowerCase() !== entry.sha256) {
      errors.push(`Prüfsumme für "${entry.path}" stimmt nicht.`);
    }
    if (actual.byteLength !== entry.byteLength) {
      errors.push(`Größe für "${entry.path}" stimmt nicht.`);
    }
  }

  for (const path of Object.keys(files)) {
    if (!manifest.files.some((entry) => entry.path === path)) {
      errors.push(`Unerwartete Datei "${path}" im Paket.`);
    }
  }

  return errors;
}

export function validatePfupdateSha256Sums(
  manifest: PfupdateManifestV1,
  sha256SumsContent: string,
): string[] {
  const errors: string[] = [];
  const parsed = parseSha256Sums(sha256SumsContent);

  if (parsed.size === 0) {
    return ['SHA256SUMS.txt ist leer oder ungültig.'];
  }

  for (const entry of manifest.files) {
    const digest = parsed.get(entry.path);
    if (!digest) {
      errors.push(`SHA256SUMS.txt: Eintrag für "${entry.path}" fehlt.`);
      continue;
    }
    if (digest !== entry.sha256) {
      errors.push(`SHA256SUMS.txt: Prüfsumme für "${entry.path}" weicht vom Manifest ab.`);
    }
  }

  for (const [path] of parsed) {
    if (!manifest.files.some((entry) => entry.path === path)) {
      errors.push(`SHA256SUMS.txt: Unerwarteter Eintrag "${path}".`);
    }
  }

  return errors;
}

export function evaluatePfupdateCompatibility(
  manifest: PfupdateManifestV1,
  input: PfupdateCompatibilityInput = {},
): PfupdateCompatibilityResult {
  const warnings: string[] = [];
  let managerCompatible = true;
  let settingsCompatible = true;

  if (input.managerVersion) {
    managerCompatible = isManagerVersionCompatible(
      input.managerVersion,
      manifest.minimumManagerVersion,
    );
    if (!managerCompatible) {
      warnings.push(
        `Manager-Version ${input.managerVersion} ist kleiner als erforderlich (${manifest.minimumManagerVersion}).`,
      );
    }
  }

  if (input.settingsFormatVersion !== undefined && input.settingsFormatVersion !== null) {
    settingsCompatible = manifest.supportedSettingsFormatVersions.includes(
      input.settingsFormatVersion,
    );
    if (!settingsCompatible) {
      warnings.push(
        `Settings-Format ${input.settingsFormatVersion} wird von diesem Update nicht unterstützt.`,
      );
    }
  }

  return {
    packageValid: true,
    managerCompatible,
    settingsCompatible,
    warnings,
  };
}

export function validatePfupdatePackage(input: {
  manifest: unknown;
  files: Record<string, PfupdateFileDigest | undefined>;
  sha256Sums?: string | null;
  compatibility?: PfupdateCompatibilityInput;
}): PfupdateValidationResult {
  const parsed = validateManifestObject(input.manifest);
  if (!parsed.manifest) {
    return {
      ok: false,
      errors: parsed.errors,
      compatibility: {
        packageValid: false,
        managerCompatible: false,
        settingsCompatible: false,
        warnings: [],
      },
    };
  }

  const errors = [...parsed.errors, ...validatePfupdateFileDigests(parsed.manifest, input.files)];

  if (input.sha256Sums) {
    errors.push(...validatePfupdateSha256Sums(parsed.manifest, input.sha256Sums));
  }

  const packageValid = errors.length === 0;
  const compatibility = evaluatePfupdateCompatibility(parsed.manifest, input.compatibility ?? {});
  compatibility.packageValid = packageValid;

  return {
    ok: packageValid,
    errors,
    manifest: parsed.manifest,
    compatibility,
  };
}

export function sha256HexBuffer(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
