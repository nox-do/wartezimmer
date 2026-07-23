import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  PFUPDATE_IMAGES_TAR_PATH,
  PFUPDATE_REQUIRED_FILE_PATHS,
  isPfupdateRelativePath,
  type PfupdateFileDigest,
  type PfupdateManifestV1,
  validatePfupdatePackage,
  type PfupdateValidationResult,
} from '@praxis-flow/server-shared';

export const PFUPDATE_COMPOSE_TEMPLATE_FILES = [
  'docker-compose.delivery.yml',
] as const;

/** Installed from .pfupdate when present (lab/legacy); rolled back with other compose templates. */
export const PFUPDATE_GATEWAY_COMPOSE_TEMPLATE_FILE =
  'docker-compose.gateway.delivery.yml' as const;

/** Installed from .pfupdate when present; rolled back with other compose templates. */
export const PFUPDATE_PROXY_COMPOSE_TEMPLATE_FILE = 'docker-compose.proxy.delivery.yml' as const;

/** Seeded only when missing — never overwritten on update. */
export const PFUPDATE_PROXY_CADDYFILE_RELATIVE = 'proxy/Caddyfile' as const;

export type TarArchiveEntryType =
  | 'file'
  | 'directory'
  | 'symlink'
  | 'hardlink'
  | 'device'
  | 'fifo'
  | 'other';

export type TarArchiveEntry = {
  rawName: string;
  name: string;
  type: TarArchiveEntryType;
};

export function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toLowerCase();
}

export function assertPathInsideRoot(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`PFUPDATE_PATH_ESCAPE: ${target}`);
  }
}

function tarTypeFromChar(typeChar: string): TarArchiveEntryType {
  switch (typeChar) {
    case '-':
      return 'file';
    case 'd':
      return 'directory';
    case 'l':
    case 'L':
      return 'symlink';
    case 'h':
    case 'H':
      return 'hardlink';
    case 'b':
    case 'c':
      return 'device';
    case 'p':
      return 'fifo';
    default:
      return 'other';
  }
}

function extractTarEntryNameFromVerboseLine(line: string): string | null {
  const bsdMatch = line.match(/\s\d{1,2}:\d{2}\s+(.+)$/);
  if (bsdMatch) {
    return bsdMatch[1].trim();
  }
  const gnuMatch = line.match(/\s\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s+(.+)$/);
  if (gnuMatch) {
    return gnuMatch[1].trim();
  }
  const bsdYearMatch = line.match(/\s\d{4}\s+(.+)$/);
  if (bsdYearMatch) {
    return bsdYearMatch[1].trim();
  }
  return null;
}

export function parseVerboseTarListLine(line: string): TarArchiveEntry | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  const typeChar = trimmed[0];
  const rawName = extractTarEntryNameFromVerboseLine(trimmed);
  if (!rawName) {
    return null;
  }
  let name = rawName;
  if (typeChar === 'l' || typeChar === 'L') {
    name = name.split(' -> ')[0]?.trim() ?? name;
  }
  return {
    rawName,
    name: normalizeTarEntryName(name),
    type: tarTypeFromChar(typeChar),
  };
}

export function assertRegularFileInStaging(stagingDir: string, relativePath: string): void {
  const absolutePath = path.join(stagingDir, relativePath);
  assertPathInsideRoot(stagingDir, absolutePath);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch {
    throw new Error(`PFUPDATE_FILE_MISSING: ${relativePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`PFUPDATE_FILE_NOT_REGULAR: ${relativePath}`);
  }
}

export function collectPfupdateFileDigests(
  stagingDir: string,
  manifest: PfupdateManifestV1,
): Record<string, PfupdateFileDigest> {
  const files: Record<string, PfupdateFileDigest> = {};
  for (const entry of manifest.files) {
    assertRegularFileInStaging(stagingDir, entry.path);
    const absolutePath = path.join(stagingDir, entry.path);
    const stat = fs.lstatSync(absolutePath);
    files[entry.path] = {
      sha256: sha256File(absolutePath),
      byteLength: stat.size,
    };
  }
  return files;
}

export function readPfupdateManifestFromStaging(stagingDir: string): PfupdateManifestV1 {
  assertRegularFileInStaging(stagingDir, 'manifest.json');
  const manifestPath = path.join(stagingDir, 'manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PfupdateManifestV1;
}

export function validateExtractedPfupdate(
  stagingDir: string,
  compatibility?: Parameters<typeof validatePfupdatePackage>[0]['compatibility'],
): PfupdateValidationResult {
  const manifest = readPfupdateManifestFromStaging(stagingDir);
  assertRegularFileInStaging(stagingDir, 'SHA256SUMS.txt');
  const sumsPath = path.join(stagingDir, 'SHA256SUMS.txt');
  const sha256Sums = fs.readFileSync(sumsPath, 'utf8');
  const files = collectPfupdateFileDigests(stagingDir, manifest);
  return validatePfupdatePackage({
    manifest,
    files,
    sha256Sums,
    compatibility,
  });
}

export function normalizeTarEntryName(entry: string): string {
  let name = entry.trim();
  if (name.startsWith('./')) {
    name = name.slice(2);
  }
  while (name.endsWith('/')) {
    name = name.slice(0, -1);
  }
  return name;
}

export function validateTarArchiveEntries(entries: TarArchiveEntry[]): void {
  for (const entry of entries) {
    if (!entry.name) {
      continue;
    }
    if (entry.type !== 'file' && entry.type !== 'directory') {
      throw new Error(`PFUPDATE_TAR_ENTRY_UNSUPPORTED: ${entry.type} ${entry.rawName}`);
    }
    if (!isPfupdateRelativePath(entry.name)) {
      throw new Error(`PFUPDATE_TAR_PATH_UNSAFE: ${entry.rawName}`);
    }
  }
}

export function parseTarVerboseListOutput(stdout: string): TarArchiveEntry[] {
  const entries: TarArchiveEntry[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = parseVerboseTarListLine(trimmed);
    if (!parsed) {
      throw new Error(`PFUPDATE_TAR_LIST_UNPARSEABLE: ${trimmed}`);
    }
    entries.push(parsed);
  }
  return entries;
}

export function listTarArchiveEntriesVerbose(archivePath: string): TarArchiveEntry[] {
  const resolvedArchive = path.resolve(archivePath);
  const result = spawnSync('tar', ['-tvzf', resolvedArchive], { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(detail || 'PFUPDATE_LIST_FAILED');
  }
  return parseTarVerboseListOutput(result.stdout);
}

export function listTarArchiveEntries(archivePath: string): string[] {
  return listTarArchiveEntriesVerbose(archivePath)
    .map((entry) => entry.name)
    .filter(Boolean);
}

export function extractPfupdateArchive(archivePath: string, stagingDir: string): void {
  const resolvedArchive = path.resolve(archivePath);
  if (!fs.existsSync(resolvedArchive) || !fs.statSync(resolvedArchive).isFile()) {
    throw new Error('PFUPDATE_ARCHIVE_NOT_FOUND');
  }

  const entries = listTarArchiveEntriesVerbose(resolvedArchive);
  validateTarArchiveEntries(entries);

  fs.mkdirSync(stagingDir, { recursive: true });

  const result = spawnSync('tar', ['xzf', resolvedArchive, '-C', stagingDir], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(detail || 'PFUPDATE_EXTRACT_FAILED');
  }

  for (const relativePath of ['manifest.json', 'SHA256SUMS.txt', ...PFUPDATE_REQUIRED_FILE_PATHS]) {
    assertRegularFileInStaging(stagingDir, relativePath);
  }
}

export function pfupdateImagesTarPath(stagingDir: string): string {
  return path.join(stagingDir, PFUPDATE_IMAGES_TAR_PATH);
}

export function pfupdateTemplatePath(stagingDir: string, fileName: string): string {
  return path.join(stagingDir, 'templates', fileName);
}

export function pfupdateOuterArchiveSha256(archivePath: string): string {
  return sha256File(path.resolve(archivePath));
}
