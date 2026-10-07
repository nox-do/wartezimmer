import { createHash } from 'node:crypto';
import { PFBACKUP_BASENAME_PREFIX, PFBACKUP_FILE_EXTENSION } from './backup-path-labels.js';
import { encodeEnvBackupTimestamp } from './env-backup.js';

export const PFBACKUP_FORMAT_VERSION = 2 as const;
/** Settings snapshot schema version used by app export/import and `.pfbackup` / `.pfupdate` compatibility. */
export const CURRENT_SETTINGS_FORMAT_VERSION = 1 as const;
export { PFBACKUP_BASENAME_PREFIX, PFBACKUP_FILE_EXTENSION } from './backup-path-labels.js';
export { formatPfbackupLabel, parsePfbackupTimestampFromPath } from './backup-path-labels.js';

export const STACK_IMAGE_ENV_KEYS = [
  'WARTEZIMMER_APP_IMAGE',
  'WARTEZIMMER_SANDBOX_IMAGE',
  'WARTEZIMMER_GATEWAY_IMAGE',
  'WARTEZIMMER_PROXY_IMAGE',
] as const;

export const SECRET_ENV_KEYS = [
  'AUTH_KEY_CAPTIVE',
  'MAINTENANCE_TOKEN',
  'SANDBOX_INTERNAL_TOKEN',
  'OPENNDS_FAS_KEY',
] as const;
export const NON_RESTORABLE_INSTALL_ENV_KEYS = [
  ...STACK_IMAGE_ENV_KEYS,
  ...SECRET_ENV_KEYS,
] as const;

export type StackImageEnvKey = (typeof STACK_IMAGE_ENV_KEYS)[number];

export type ManagerReleaseState = {
  releaseVersion: string | null;
  appImage: string;
  sandboxImage: string;
  gatewayImage?: string | null;
  archiveSha256: string | null;
};

export type ManagerState = {
  release: ManagerReleaseState | null;
};

export type PfbackupManifestEntryV2 = {
  name: 'settings.json' | 'manager-state.json' | 'tls.tgz';
  sha256: string;
  byteLength: number;
};

export type PfbackupManifestV2 = {
  pfbackupFormatVersion: typeof PFBACKUP_FORMAT_VERSION;
  createdAt: string;
  settingsFormatVersion: number;
  entries: PfbackupManifestEntryV2[];
};

export type PfbackupArchiveV2 = {
  manifest: PfbackupManifestV2;
  settingsJson: string;
  managerStateJson: string;
  tlsArchiveBase64?: string;
};

export type PfbackupValidationSummary = {
  createdAt: string;
  settingsFormatVersion: number;
  exportedAt: string | null;
  releaseVersion: string | null;
  routingMode: string | null;
};

/** Stage 1: archive container, manifest and checksum integrity. */
export type PfbackupArchiveValidationResult = {
  archiveValid: boolean;
  errors: string[];
  summary?: PfbackupValidationSummary;
};

export function sha256HexBytes(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export function decodePfbackupTls(value: string): Buffer {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error('Ungültige HTTPS-Daten im Backup.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.toString('base64') !== value)
    throw new Error('Ungültige HTTPS-Daten im Backup.');
  return bytes;
}

export function sha256HexUtf8(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function stableJsonStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function envRecordForSettingsExport(source: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string' || value === '') {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeManagerState(raw: unknown): ManagerState {
  if (!raw || typeof raw !== 'object') {
    return { release: null };
  }

  const release = (raw as { release?: unknown }).release;
  if (!release || typeof release !== 'object') {
    return { release: null };
  }

  const candidate = release as Partial<ManagerReleaseState>;
  if (!isNonEmptyString(candidate.appImage) || !isNonEmptyString(candidate.sandboxImage)) {
    return { release: null };
  }

  return {
    release: {
      releaseVersion: isNonEmptyString(candidate.releaseVersion)
        ? candidate.releaseVersion.trim()
        : null,
      appImage: candidate.appImage.trim(),
      sandboxImage: candidate.sandboxImage.trim(),
      gatewayImage:
        candidate.gatewayImage === undefined || candidate.gatewayImage === null
          ? null
          : isNonEmptyString(candidate.gatewayImage)
            ? candidate.gatewayImage.trim()
            : null,
      archiveSha256: isNonEmptyString(candidate.archiveSha256)
        ? candidate.archiveSha256.trim().toLowerCase()
        : null,
    },
  };
}

export type ManagerStateValidationResult = {
  ok: boolean;
  errors: string[];
  state?: ManagerState;
};

const MANAGER_RELEASE_KEYS = new Set([
  'releaseVersion',
  'appImage',
  'sandboxImage',
  'gatewayImage',
  'archiveSha256',
]);

/**
 * Strict validation for manager-state embedded in `.pfbackup`.
 * Unlike {@link normalizeManagerState}, invalid release objects are rejected — not coerced to null.
 */
export function validateManagerStateForBackup(raw: unknown): ManagerStateValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['manager-state.json muss ein Objekt sein.'] };
  }

  const record = raw as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of Object.keys(record)) {
    if (key !== 'release') {
      errors.push(`manager-state.json: Unbekanntes Feld "${key}".`);
    }
  }

  if (!('release' in record)) {
    errors.push(
      'manager-state.json: Feld release fehlt (explizit null oder Release-Objekt erwartet).',
    );
    return { ok: false, errors };
  }

  const release = record.release;
  if (release === null) {
    return errors.length === 0
      ? { ok: true, errors: [], state: { release: null } }
      : { ok: false, errors };
  }

  if (typeof release !== 'object' || Array.isArray(release)) {
    errors.push('manager-state.json: release muss null oder ein Objekt sein.');
    return { ok: false, errors };
  }

  const releaseRecord = release as Record<string, unknown>;
  for (const key of Object.keys(releaseRecord)) {
    if (!MANAGER_RELEASE_KEYS.has(key)) {
      errors.push(`manager-state.json: Unbekanntes release-Feld "${key}".`);
    }
  }

  if (!isNonEmptyString(releaseRecord.appImage)) {
    errors.push('manager-state.json: release.appImage fehlt oder ist leer.');
  }
  if (!isNonEmptyString(releaseRecord.sandboxImage)) {
    errors.push('manager-state.json: release.sandboxImage fehlt oder ist leer.');
  }

  if (
    releaseRecord.gatewayImage !== undefined &&
    releaseRecord.gatewayImage !== null &&
    !isNonEmptyString(releaseRecord.gatewayImage)
  ) {
    errors.push('manager-state.json: release.gatewayImage muss String oder null sein.');
  }

  if (
    releaseRecord.releaseVersion !== undefined &&
    releaseRecord.releaseVersion !== null &&
    !isNonEmptyString(releaseRecord.releaseVersion)
  ) {
    errors.push('manager-state.json: release.releaseVersion muss String oder null sein.');
  }

  if (releaseRecord.archiveSha256 !== undefined && releaseRecord.archiveSha256 !== null) {
    if (!isNonEmptyString(releaseRecord.archiveSha256)) {
      errors.push('manager-state.json: release.archiveSha256 muss String oder null sein.');
    } else if (!/^[a-f0-9]{64}$/.test(releaseRecord.archiveSha256.trim().toLowerCase())) {
      errors.push('manager-state.json: release.archiveSha256 ist keine gültige SHA-256-Prüfsumme.');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    state: {
      release: {
        releaseVersion: isNonEmptyString(releaseRecord.releaseVersion)
          ? releaseRecord.releaseVersion.trim()
          : null,
        appImage: (releaseRecord.appImage as string).trim(),
        sandboxImage: (releaseRecord.sandboxImage as string).trim(),
        gatewayImage:
          releaseRecord.gatewayImage === undefined || releaseRecord.gatewayImage === null
            ? null
            : isNonEmptyString(releaseRecord.gatewayImage)
              ? releaseRecord.gatewayImage.trim()
              : null,
        archiveSha256: isNonEmptyString(releaseRecord.archiveSha256)
          ? releaseRecord.archiveSha256.trim().toLowerCase()
          : null,
      },
    },
  };
}

export function validateManagerStateJsonForBackup(
  managerStateJson: string,
): ManagerStateValidationResult {
  try {
    return validateManagerStateForBackup(JSON.parse(managerStateJson));
  } catch {
    return { ok: false, errors: ['manager-state.json ist kein gültiges JSON.'] };
  }
}

export function buildPfbackupFilename(date = new Date()): string {
  return `${PFBACKUP_BASENAME_PREFIX}${encodeEnvBackupTimestamp(date)}.${PFBACKUP_FILE_EXTENSION}`;
}

export function buildPfbackupArchive(input: {
  settings: unknown;
  managerState: ManagerState;
  createdAt?: string;
  tlsArchiveBase64?: string;
}): PfbackupArchiveV2 {
  const settingsJson = stableJsonStringify(input.settings);
  const managerStateJson = stableJsonStringify(input.managerState);
  const settingsRecord = input.settings as { settingsFormatVersion?: number };
  const settingsFormatVersion = Number(settingsRecord.settingsFormatVersion ?? 1);

  const settingsEntry: PfbackupManifestEntryV2 = {
    name: 'settings.json',
    sha256: sha256HexUtf8(settingsJson),
    byteLength: Buffer.byteLength(settingsJson, 'utf8'),
  };
  const managerEntry: PfbackupManifestEntryV2 = {
    name: 'manager-state.json',
    sha256: sha256HexUtf8(managerStateJson),
    byteLength: Buffer.byteLength(managerStateJson, 'utf8'),
  };

  const tlsBytes =
    input.tlsArchiveBase64 === undefined ? null : decodePfbackupTls(input.tlsArchiveBase64);
  const entries = [settingsEntry, managerEntry];
  if (tlsBytes)
    entries.push({
      name: 'tls.tgz',
      sha256: sha256HexBytes(tlsBytes),
      byteLength: tlsBytes.length,
    });
  return {
    ...(tlsBytes ? { tlsArchiveBase64: input.tlsArchiveBase64 } : {}),
    manifest: {
      pfbackupFormatVersion: PFBACKUP_FORMAT_VERSION,
      createdAt: input.createdAt ?? new Date().toISOString(),
      settingsFormatVersion,
      entries,
    },
    settingsJson,
    managerStateJson,
  };
}

export function serializePfbackupArchive(archive: PfbackupArchiveV2): string {
  return stableJsonStringify(archive);
}

export function parsePfbackupArchive(raw: unknown): PfbackupArchiveV2 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('PFBACKUP_INVALID');
  }

  const candidate = raw as Partial<PfbackupArchiveV2>;
  if (!candidate.manifest || typeof candidate.manifest !== 'object') {
    throw new Error('PFBACKUP_MANIFEST_MISSING');
  }
  if (
    typeof candidate.settingsJson !== 'string' ||
    typeof candidate.managerStateJson !== 'string'
  ) {
    throw new Error('PFBACKUP_PAYLOAD_MISSING');
  }

  if (candidate.tlsArchiveBase64 !== undefined) decodePfbackupTls(candidate.tlsArchiveBase64);
  return {
    ...(candidate.tlsArchiveBase64 !== undefined
      ? { tlsArchiveBase64: candidate.tlsArchiveBase64 }
      : {}),
    manifest: candidate.manifest as PfbackupManifestV2,
    settingsJson: candidate.settingsJson,
    managerStateJson: candidate.managerStateJson,
  };
}

function manifestEntry(
  entries: PfbackupManifestEntryV2[],
  name: PfbackupManifestEntryV2['name'],
): PfbackupManifestEntryV2 | undefined {
  return entries.find((entry) => entry.name === name);
}

export function validatePfbackupArchive(raw: unknown): PfbackupArchiveValidationResult {
  const errors: string[] = [];

  let archive: PfbackupArchiveV2;
  try {
    archive = parsePfbackupArchive(raw);
  } catch (error) {
    return {
      archiveValid: false,
      errors: [error instanceof Error ? error.message : 'Ungültiges Backup-Format.'],
    };
  }

  const { manifest, settingsJson, managerStateJson } = archive;
  if (manifest.pfbackupFormatVersion !== PFBACKUP_FORMAT_VERSION) {
    errors.push(
      `Nicht unterstützte Backup-Version ${String(manifest.pfbackupFormatVersion)} (erwartet ${PFBACKUP_FORMAT_VERSION}).`,
    );
  }

  if (
    !Array.isArray(manifest.entries) ||
    manifest.entries.some((entry) => !entry || typeof entry !== 'object')
  ) {
    return { archiveValid: false, errors: ['Manifest-Einträge ungültig.'] };
  }
  const names = manifest.entries.map((entry) => entry.name);
  if (
    new Set(names).size !== names.length ||
    names.some((name) => !['settings.json', 'manager-state.json', 'tls.tgz'].includes(name))
  )
    errors.push('Unbekannte oder doppelte Manifest-Einträge.');
  const tlsEntry = manifestEntry(manifest.entries, 'tls.tgz');
  const tlsBytes =
    archive.tlsArchiveBase64 === undefined ? null : decodePfbackupTls(archive.tlsArchiveBase64);
  if (Boolean(tlsEntry) !== Boolean(tlsBytes))
    errors.push('HTTPS-Eintrag und HTTPS-Daten müssen gemeinsam vorhanden sein.');
  if (
    tlsEntry &&
    tlsBytes &&
    (tlsEntry.sha256 !== sha256HexBytes(tlsBytes) || tlsEntry.byteLength !== tlsBytes.length)
  )
    errors.push('Prüfsumme oder Größe für tls.tgz stimmt nicht.');
  const settingsEntry = manifestEntry(manifest.entries, 'settings.json');
  const managerEntry = manifestEntry(manifest.entries ?? [], 'manager-state.json');
  if (!settingsEntry || !managerEntry) {
    errors.push('Manifest-Einträge unvollständig.');
  }

  if (settingsEntry) {
    const actualSha = sha256HexUtf8(settingsJson);
    if (actualSha !== settingsEntry.sha256) {
      errors.push('Prüfsumme für settings.json stimmt nicht.');
    }
    if (Buffer.byteLength(settingsJson, 'utf8') !== settingsEntry.byteLength) {
      errors.push('Größe für settings.json stimmt nicht.');
    }
  }

  if (managerEntry) {
    const actualSha = sha256HexUtf8(managerStateJson);
    if (actualSha !== managerEntry.sha256) {
      errors.push('Prüfsumme für manager-state.json stimmt nicht.');
    }
    if (Buffer.byteLength(managerStateJson, 'utf8') !== managerEntry.byteLength) {
      errors.push('Größe für manager-state.json stimmt nicht.');
    }
  }

  let settingsParsed: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(settingsJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('invalid settings');
    settingsParsed = parsed as Record<string, unknown>;
  } catch {
    errors.push('settings.json ist kein gültiges JSON.');
  }

  if (settingsParsed) {
    if (settingsParsed.settingsFormatVersion !== manifest.settingsFormatVersion) {
      errors.push('settingsFormatVersion im Manifest und Snapshot weichen ab.');
    }
    if (settingsParsed.settingsFormatVersion !== CURRENT_SETTINGS_FORMAT_VERSION) {
      errors.push(
        `Nicht unterstützte Settings-Version ${String(settingsParsed.settingsFormatVersion)}.`,
      );
    }
    for (const key of ['opsSettings', 'authSettings', 'messagingProviderConfigs', 'env']) {
      if (!(key in settingsParsed)) {
        errors.push(`Settings-Snapshot fehlt Feld ${key}.`);
      }
    }
  }

  let managerState: ManagerState | undefined;
  let managerStateParsed: unknown;
  try {
    managerStateParsed = JSON.parse(managerStateJson);
  } catch {
    errors.push('manager-state.json ist kein gültiges JSON.');
  }

  if (managerStateParsed !== undefined) {
    const managerValidation = validateManagerStateForBackup(managerStateParsed);
    if (!managerValidation.ok) {
      errors.push(...managerValidation.errors);
    } else {
      managerState = managerValidation.state;
    }
  }

  const opsSettings =
    settingsParsed?.opsSettings && typeof settingsParsed.opsSettings === 'object'
      ? (settingsParsed.opsSettings as Record<string, unknown>)
      : null;

  return {
    archiveValid: errors.length === 0,
    errors,
    summary:
      errors.length === 0
        ? {
            createdAt: manifest.createdAt,
            settingsFormatVersion: manifest.settingsFormatVersion,
            exportedAt:
              typeof settingsParsed?.exportedAt === 'string' ? settingsParsed.exportedAt : null,
            releaseVersion: managerState?.release?.releaseVersion ?? null,
            routingMode:
              typeof opsSettings?.routingMode === 'string' ? opsSettings.routingMode : null,
          }
        : undefined,
  };
}
