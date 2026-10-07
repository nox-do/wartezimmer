import { assertWindowsHostPath } from './windows-host-path.js';
import fs from 'node:fs';
import path from 'node:path';
import { backupEnvFile, updateEnvKeys } from './env-file.js';
import type { SetupContext } from './setup-context.js';

export type StorageFolders = {
  imports: string;
  exports: string;
};

export type WriteStorageFoldersResult = {
  envPath: string;
  backupPath: string | null;
  folders: StorageFolders;
  created: string[];
};

export const INVALID_FOLDER_PATH = 'INVALID_FOLDER_PATH';
export const FOLDER_PATH_NOT_DIRECTORY = 'FOLDER_PATH_NOT_DIRECTORY';

export function normalizeHostFolderPath(value: string): string {
  const trimmed = process.platform === 'win32' ? value : value.trim();
  if (!trimmed) {
    throw new Error(INVALID_FOLDER_PATH);
  }

  let expanded = trimmed;
  if (expanded.startsWith('~/')) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    if (!home) {
      throw new Error(INVALID_FOLDER_PATH);
    }
    expanded = path.join(home, expanded.slice(2));
  } else if (expanded === '~') {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    if (!home) {
      throw new Error(INVALID_FOLDER_PATH);
    }
    expanded = home;
  }

  assertWindowsHostPath(expanded, { allowMappedDrive: true });
  if (!path.isAbsolute(expanded) || /[\r\n\0]/.test(expanded)) {
    throw new Error(INVALID_FOLDER_PATH);
  }

  const absolute = path.normalize(expanded);
  if (!absolute || absolute === '.' || absolute === '..') {
    throw new Error(INVALID_FOLDER_PATH);
  }

  return absolute;
}

export function defaultStorageFolders(): StorageFolders {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  return {
    imports: path.join(home, 'wartezimmer-imports'),
    exports: path.join(home, 'wartezimmer-exports'),
  };
}

export function expandStorageFolderPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('~/')) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    return home ? path.join(home, trimmed.slice(2)) : trimmed;
  }
  if (trimmed === '~') {
    return process.env.HOME ?? process.env.USERPROFILE ?? trimmed;
  }
  return trimmed;
}

export function resolveStorageFoldersFromSources(input?: {
  envMap?: Map<string, string>;
}): StorageFolders {
  const defaults = defaultStorageFolders();
  const imports =
    process.env.IMPORTS_HOST_PATH?.trim() ||
    input?.envMap?.get('IMPORTS_HOST_PATH')?.trim() ||
    defaults.imports;
  const exports =
    process.env.EXPORTS_HOST_PATH?.trim() ||
    input?.envMap?.get('EXPORTS_HOST_PATH')?.trim() ||
    defaults.exports;
  return {
    imports: expandStorageFolderPath(imports),
    exports: expandStorageFolderPath(exports),
  };
}

export function normalizeStorageFoldersInput(input: {
  importsHostPath: string;
  exportsHostPath: string;
}): StorageFolders {
  return {
    imports: normalizeHostFolderPath(input.importsHostPath),
    exports: normalizeHostFolderPath(input.exportsHostPath),
  };
}

function ensureStorageFoldersOnDisk(folders: StorageFolders): string[] {
  const created: string[] = [];
  for (const dir of [folders.imports, folders.exports]) {
    if (fs.existsSync(dir)) {
      if (!fs.statSync(dir).isDirectory()) {
        throw new Error(FOLDER_PATH_NOT_DIRECTORY);
      }
    } else {
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }
  return created;
}

export function prepareStorageFoldersOnDisk(folders: StorageFolders): {
  folders: StorageFolders;
  created: string[];
} {
  const normalized = {
    imports: normalizeHostFolderPath(folders.imports),
    exports: normalizeHostFolderPath(folders.exports),
  };
  const created = ensureStorageFoldersOnDisk(normalized);
  return { folders: normalized, created };
}

export function writeStorageFolders(
  ctx: SetupContext,
  folders: StorageFolders,
  options?: { backup?: boolean },
): WriteStorageFoldersResult {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('ENV_MISSING');
  }

  const prepared = prepareStorageFoldersOnDisk(folders);

  let backupPath: string | null = null;
  if (options?.backup !== false) {
    const backup = backupEnvFile(ctx.home);
    backupPath = backup.backupPath;
  }

  updateEnvKeys(envPath, {
    IMPORTS_HOST_PATH: prepared.folders.imports,
    EXPORTS_HOST_PATH: prepared.folders.exports,
  });

  return {
    envPath,
    backupPath,
    folders: prepared.folders,
    created: prepared.created,
  };
}
