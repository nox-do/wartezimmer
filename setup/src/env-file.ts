import { durableWrite } from './restricted-operation.js';
import fs from 'node:fs';
import path from 'node:path';
import { buildEnvBackupPath, ENV_BACKUP_BASENAME_PREFIX } from '@praxis-flow/server-shared';
import type { GeneratedSecrets } from './secrets.js';

export type EnvMergeInput = {
  practiceDisplayName: string;
  secrets: GeneratedSecrets;
  extra: Record<string, string>;
};

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const eq = trimmed.indexOf('=');
  if (eq <= 0) {
    return null;
  }
  return {
    key: trimmed.slice(0, eq).trim(),
    value: unescapeEnvValueFromCompose(trimmed.slice(eq + 1).trim()),
  };
}

/** Docker Compose treats `$` in `--env-file` values as interpolation; escape for disk. */
export function escapeEnvValueForCompose(value: string): string {
  return value.replace(/\$/g, '$$$$');
}

export function unescapeEnvValueFromCompose(value: string): string {
  return value.replace(/\$\$/g, '$');
}

/** Read-only counterpart of ensureEnvComposeEscaping; never returns secret values. */
export function envKeysNeedingComposeEscaping(content: string): string[] {
  const keys = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const rawValue = line.slice(line.indexOf('=') + 1).trim();
    if (rawValue !== escapeEnvValueForCompose(parsed.value)) keys.add(parsed.key);
  }
  return [...keys];
}

function formatEnvLine(key: string, value: string): string {
  return `${key}=${escapeEnvValueForCompose(value)}`;
}

export function readEnvMap(envPath: string): Map<string, string> {
  if (!fs.existsSync(envPath)) {
    return new Map();
  }
  return parseEnvMap(fs.readFileSync(envPath, 'utf8'));
}

/** Same parser for the installed env and the previous env in an operation journal. */
export function parseEnvMap(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (parsed) {
      map.set(parsed.key, parsed.value);
    }
  }
  return map;
}

export function writeEnvFromExample(
  projectRoot: string,
  merge: EnvMergeInput,
  options?: { preserveExistingKeys?: string[] },
): { envPath: string; backupPath: string | null; keysWritten: string[] } {
  const examplePath = path.join(projectRoot, '.env.example');
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(examplePath)) {
    throw new Error('ENV_EXAMPLE_MISSING');
  }

  let backupPath: string | null = null;
  const existing = readEnvMap(envPath);
  if (fs.existsSync(envPath)) {
    backupPath = buildEnvBackupPath(envPath);
    fs.copyFileSync(envPath, backupPath);
  }

  const preserve = new Set(options?.preserveExistingKeys ?? []);
  const overrides = new Map<string, string>([
    ['AUTH_KEY_CAPTIVE', merge.secrets.AUTH_KEY_CAPTIVE],
    ['MAINTENANCE_TOKEN', merge.secrets.MAINTENANCE_TOKEN],
    ['SANDBOX_INTERNAL_TOKEN', merge.secrets.SANDBOX_INTERNAL_TOKEN],
    ['OPENNDS_FAS_KEY', merge.secrets.OPENNDS_FAS_KEY],
  ]);
  const practiceName = merge.practiceDisplayName.trim();
  if (practiceName) {
    overrides.set('PRACTICE_DISPLAY_NAME', practiceName);
  }

  for (const [key, value] of Object.entries(merge.extra)) {
    overrides.set(key, value);
  }

  const lines = fs.readFileSync(examplePath, 'utf8').split(/\r?\n/);
  const keysWritten: string[] = [];
  const keysSeen = new Set<string>();
  const output: string[] = [];

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      output.push(line);
      continue;
    }

    if (preserve.has(parsed.key) && existing.has(parsed.key)) {
      output.push(formatEnvLine(parsed.key, existing.get(parsed.key)!));
      keysSeen.add(parsed.key);
      continue;
    }

    if (overrides.has(parsed.key)) {
      const value = overrides.get(parsed.key)!;
      output.push(formatEnvLine(parsed.key, value));
      keysWritten.push(parsed.key);
      keysSeen.add(parsed.key);
      overrides.delete(parsed.key);
      continue;
    }

    if (existing.has(parsed.key)) {
      output.push(formatEnvLine(parsed.key, existing.get(parsed.key)!));
      keysSeen.add(parsed.key);
      continue;
    }

    keysSeen.add(parsed.key);
    output.push(line);
  }

  for (const [key, value] of overrides) {
    output.push(formatEnvLine(key, value));
    keysSeen.add(key);
    keysWritten.push(key);
  }

  for (const key of preserve) {
    if (existing.has(key) && !keysSeen.has(key)) {
      output.push(formatEnvLine(key, existing.get(key)!));
      keysSeen.add(key);
    }
  }

  fs.writeFileSync(envPath, `${output.join('\n')}\n`, 'utf8');
  return { envPath, backupPath, keysWritten };
}

/**
 * Merge backup ENV values into an existing `.env` file.
 * Keys absent from `record` are kept unchanged (see mergeConfigRestoreEnv).
 */
export function writeEnvRecordAtomically(
  envPath: string,
  record: Record<string, string>,
  options: { replace?: boolean } = {},
): { keysWritten: string[] } {
  const recordMap = new Map(Object.entries(record));
  const keysWritten: string[] = [];
  const keysSeen = new Set<string>();
  const output: string[] = [];

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (parsed && keysSeen.has(parsed.key)) continue;
      if (options.replace && parsed && !Object.hasOwn(record, parsed.key)) continue;
      if (!parsed || !recordMap.has(parsed.key)) {
        output.push(line);
        continue;
      }
      const value = recordMap.get(parsed.key)!;
      output.push(formatEnvLine(parsed.key, value));
      keysWritten.push(parsed.key);
      keysSeen.add(parsed.key);
      recordMap.delete(parsed.key);
    }
  }

  for (const [key, value] of recordMap) {
    output.push(formatEnvLine(key, value));
    keysWritten.push(key);
    keysSeen.add(key);
  }

  durableWrite(envPath, `${output.join('\n')}\n`);
  return { keysWritten };
}

export function updateEnvKeys(
  envPath: string,
  updates: Record<string, string>,
): { keysWritten: string[] } {
  if (!fs.existsSync(envPath)) {
    throw new Error('ENV_MISSING');
  }

  const updateMap = new Map(Object.entries(updates));
  const keysWritten: string[] = [];
  const keysSeen = new Set<string>();
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const output = lines.map((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || !updateMap.has(parsed.key)) {
      return line;
    }
    const value = updateMap.get(parsed.key)!;
    keysSeen.add(parsed.key);
    keysWritten.push(parsed.key);
    return formatEnvLine(parsed.key, value);
  });

  for (const [key, value] of updateMap) {
    if (!keysSeen.has(key)) {
      output.push(formatEnvLine(key, value));
      keysWritten.push(key);
    }
  }

  fs.writeFileSync(envPath, `${output.join('\n')}\n`, 'utf8');
  return { keysWritten };
}

export function removeEnvKeys(envPath: string, keys: string[]): { keysRemoved: string[] } {
  if (!fs.existsSync(envPath)) {
    throw new Error('ENV_MISSING');
  }

  const removeSet = new Set(keys);
  const keysRemoved: string[] = [];
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const output = lines.filter((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || !removeSet.has(parsed.key)) {
      return true;
    }
    keysRemoved.push(parsed.key);
    return false;
  });

  fs.writeFileSync(envPath, `${output.join('\n')}\n`, 'utf8');
  return { keysRemoved };
}

export function backupEnvFile(projectRoot: string): { envPath: string; backupPath: string } {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('ENV_MISSING');
  }
  const backupPath = buildEnvBackupPath(envPath);
  fs.copyFileSync(envPath, backupPath);
  return { envPath, backupPath };
}

export function findLatestEnvBackupPath(projectRoot: string): string | null {
  const prefix = ENV_BACKUP_BASENAME_PREFIX;
  let entries: string[];
  try {
    entries = fs.readdirSync(projectRoot);
  } catch {
    return null;
  }

  const backups = entries
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(projectRoot, name))
    .sort()
    .reverse();

  return backups[0] ?? null;
}

/** Rewrite `.env` so `$` in values is escaped for Docker Compose (`$` → `$$`). */
export function ensureEnvComposeEscaping(projectRoot: string): boolean {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return false;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  let changed = false;
  const output = lines.map((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      return line;
    }
    const rawValue = line.slice(line.indexOf('=') + 1).trim();
    const nextValue = escapeEnvValueForCompose(parsed.value);
    if (rawValue !== nextValue) {
      changed = true;
      return formatEnvLine(parsed.key, parsed.value);
    }
    return line;
  });

  if (changed) {
    fs.writeFileSync(envPath, `${output.join('\n')}\n`, 'utf8');
  }
  return changed;
}
