import { promises as fs } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { resolveContactLookupBasePath } from '../contacts/contact-lookup-paths.js';

export type DeploymentCsvFileInfo = {
  fileName: string;
  containerPath: string;
  sizeBytes: number;
  updatedAt: string;
};

export type DeploymentImportFolderInfo = {
  label: string;
  containerPath: string;
};

export type DeploymentVolumeStatus = {
  containerPath: string;
  userFolderLabel: string;
  ready: boolean;
  hint: string | null;
  csvFiles: DeploymentCsvFileInfo[];
  importFolders: DeploymentImportFolderInfo[];
};

export type DeploymentStorageSnapshot = {
  imports: DeploymentVolumeStatus;
  exports: DeploymentVolumeStatus;
  serverTime: string;
};

import { resolveUserFolderLabel } from './user-folder-labels.js';

async function isPathReady(targetPath: string, mode: number): Promise<boolean> {
  try {
    await fs.access(targetPath, mode);
    return true;
  } catch {
    return false;
  }
}

async function listCsvFiles(basePath: string): Promise<DeploymentCsvFileInfo[]> {
  let entries: string[];
  try {
    entries = await fg('**/*.csv', {
      cwd: basePath,
      absolute: true,
      onlyFiles: true,
      caseSensitiveMatch: false,
    });
  } catch {
    return [];
  }

  const files: DeploymentCsvFileInfo[] = [];
  for (const containerPath of entries.sort((a, b) => a.localeCompare(b))) {
    try {
      const stat = await fs.stat(containerPath);
      if (!stat.isFile()) {
        continue;
      }
      const relativePath = path.relative(basePath, containerPath).split(path.sep).join('/');
      files.push({
        fileName: relativePath,
        containerPath,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      continue;
    }
  }

  return files;
}

async function listImportFolders(basePath: string): Promise<DeploymentImportFolderInfo[]> {
  const options: DeploymentImportFolderInfo[] = [{ label: '/', containerPath: basePath }];
  try {
    const dirs = await fg('**/', {
      cwd: basePath,
      onlyDirectories: true,
      absolute: true,
    });
    for (const dirPath of dirs.sort((a, b) => a.localeCompare(b))) {
      const relative = path.relative(basePath, dirPath);
      options.push({
        label: relative.split(path.sep).join('/') || '/',
        containerPath: dirPath,
      });
    }
  } catch {
    return options;
  }
  return options;
}

async function buildVolumeStatus(
  containerPath: string,
  userFolderLabel: string,
  accessMode: number,
  listImports: boolean,
): Promise<DeploymentVolumeStatus> {
  const ready = await isPathReady(containerPath, accessMode);
  let hint: string | null = null;
  if (!ready) {
    hint =
      'Ordner nicht erreichbar. Prüfen Sie Docker File Sharing und starten Sie die Container neu. Standard: ' +
      userFolderLabel;
  }

  return {
    containerPath,
    userFolderLabel,
    ready,
    hint,
    csvFiles: listImports && ready ? await listCsvFiles(containerPath) : [],
    importFolders: listImports && ready ? await listImportFolders(containerPath) : [],
  };
}

export async function getDeploymentStorageSnapshot(): Promise<DeploymentStorageSnapshot> {
  const importsPath = resolveContactLookupBasePath();
  const exportsPath = path.resolve(process.env.EXPORT_BASE_PATH?.trim() || '/exports');

  const [imports, exports] = await Promise.all([
    buildVolumeStatus(
      importsPath,
      resolveUserFolderLabel('IMPORTS_HOST_PATH', 'imports'),
      fs.constants.R_OK,
      true,
    ),
    buildVolumeStatus(
      exportsPath,
      resolveUserFolderLabel('EXPORTS_HOST_PATH', 'exports'),
      fs.constants.R_OK | fs.constants.W_OK,
      false,
    ),
  ]);

  return {
    imports,
    exports,
    serverTime: new Date().toISOString(),
  };
}
