import { syncDirectory, replaceFile } from './maintenance-files.js';
import fs from 'node:fs';
import path from 'node:path';
import { runDockerCommand, type CommandResult } from './docker-cli.js';
import { APP_DB_PATH, appDataVolumeName } from './staff-pin-reset.js';

export const APP_DB_BASENAME = 'wartezimmer.db';

export const APP_DB_RELATED_FILES = [
  APP_DB_BASENAME,
  `${APP_DB_BASENAME}-wal`,
  `${APP_DB_BASENAME}-shm`,
] as const;

export type AppDataVolumeAccess = {
  backupDbFiles: (targetDir: string) => Promise<string[]>;
  moveDbAside: (asideDir: string) => Promise<void>;
  restoreDbFiles: (sourceDir: string) => Promise<void>;
  listPresentDbFiles: () => Promise<string[]>;
};

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileIfExists(source: string, target: string): boolean {
  if (!fs.existsSync(source)) {
    return false;
  }
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
  return true;
}

function moveFileIfExists(source: string, target: string): boolean {
  if (!fs.existsSync(source)) {
    return false;
  }
  ensureDir(path.dirname(target));
  replaceFile(source, target);
  return true;
}

function assertDockerSuccess(result: CommandResult, operation: string): void {
  if (result.code === 0) {
    return;
  }
  const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
  throw new Error(detail || `APP_DATA_OPERATION_FAILED: ${operation}`);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Copy one DB-related file when present — exit 0 when source is absent. */
function copyIfPresentScript(source: string, target: string): string {
  return `if [ -f ${shellQuote(source)} ]; then cp ${shellQuote(source)} ${shellQuote(target)}; fi`;
}

/** Move one DB-related file when present — exit 0 when source is absent. */
function moveIfPresentScript(source: string, target: string): string {
  return `if [ -f ${shellQuote(source)} ]; then mv ${shellQuote(source)} ${shellQuote(target)}; fi`;
}

function restoreOneFileScript(volumePath: string, rollbackPath: string): string {
  return [
    `rm -f ${shellQuote(volumePath)}`,
    `if [ -f ${shellQuote(rollbackPath)} ]; then cp ${shellQuote(rollbackPath)} ${shellQuote(volumePath)}; fi`,
    'sync',
  ].join('; ');
}

export function createLocalAppDataAccess(dataDir: string): AppDataVolumeAccess {
  return {
    async backupDbFiles(targetDir: string): Promise<string[]> {
      ensureDir(targetDir);
      const copied: string[] = [];
      for (const name of APP_DB_RELATED_FILES) {
        const source = path.join(dataDir, name);
        const target = path.join(targetDir, name);
        if (copyFileIfExists(source, target)) {
          copied.push(name);
        }
      }
      return copied;
    },

    async moveDbAside(asideDir: string): Promise<void> {
      ensureDir(asideDir);
      for (const name of APP_DB_RELATED_FILES) {
        moveFileIfExists(path.join(dataDir, name), path.join(asideDir, name));
      }
    },

    async restoreDbFiles(sourceDir: string): Promise<void> {
      for (const name of APP_DB_RELATED_FILES) {
        const source = path.join(sourceDir, name);
        const target = path.join(dataDir, name);
        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
        if (copyFileIfExists(source, target)) {
          const fd = fs.openSync(target, process.platform === 'win32' ? 'r+' : 'r');
          try {
            fs.fsyncSync(fd);
          } finally {
            fs.closeSync(fd);
          }
        }
      }
      syncDirectory(dataDir);
    },

    async listPresentDbFiles(): Promise<string[]> {
      const present: string[] = [];
      for (const name of APP_DB_RELATED_FILES) {
        if (fs.existsSync(path.join(dataDir, name))) {
          present.push(name);
        }
      }
      return present;
    },
  };
}

const DOCKER_APP_DATA_MOUNT = '/var/lib/wartezimmer/app';

function dockerUtilityRunArgs(
  composeProjectName: string,
  utilityImage: string,
  hostMount?: { hostPath: string; containerPath: string },
): string[] {
  const args = [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    '-v',
    `${appDataVolumeName(composeProjectName)}:${DOCKER_APP_DATA_MOUNT}`,
  ];
  if (hostMount) {
    args.push('-v', `${hostMount.hostPath}:${hostMount.containerPath}`);
  }
  args.push(utilityImage, '-ec');
  return args;
}

export function createDockerAppDataAccess(
  composeProjectName: string,
  utilityImage: string,
): AppDataVolumeAccess {
  if (!utilityImage.trim()) {
    throw new Error('WARTEZIMMER_APP_IMAGE fehlt — App-Daten-Volume-Operationen nicht möglich.');
  }

  return {
    async backupDbFiles(targetDir: string): Promise<string[]> {
      ensureDir(targetDir);
      const copied: string[] = [];
      for (const name of APP_DB_RELATED_FILES) {
        const source = `${DOCKER_APP_DATA_MOUNT}/${name}`;
        const target = `/backup/${name}`;
        const result = await runDockerCommand([
          ...dockerUtilityRunArgs(composeProjectName, utilityImage, {
            hostPath: targetDir,
            containerPath: '/backup',
          }),
          copyIfPresentScript(source, target),
        ]);
        assertDockerSuccess(result, `backupDbFiles:${name}`);
        if (fs.existsSync(path.join(targetDir, name))) {
          copied.push(name);
        }
      }
      return copied;
    },

    async moveDbAside(asideDir: string): Promise<void> {
      ensureDir(asideDir);
      for (const name of APP_DB_RELATED_FILES) {
        const source = `${DOCKER_APP_DATA_MOUNT}/${name}`;
        const target = `/aside/${name}`;
        const result = await runDockerCommand([
          ...dockerUtilityRunArgs(composeProjectName, utilityImage, {
            hostPath: asideDir,
            containerPath: '/aside',
          }),
          moveIfPresentScript(source, target),
        ]);
        assertDockerSuccess(result, `moveDbAside:${name}`);
      }
    },

    async restoreDbFiles(sourceDir: string): Promise<void> {
      for (const name of APP_DB_RELATED_FILES) {
        const volumePath = `${DOCKER_APP_DATA_MOUNT}/${name}`;
        const rollbackPath = `/rollback/${name}`;
        const result = await runDockerCommand([
          ...dockerUtilityRunArgs(composeProjectName, utilityImage, {
            hostPath: sourceDir,
            containerPath: '/rollback',
          }),
          restoreOneFileScript(volumePath, rollbackPath),
        ]);
        assertDockerSuccess(result, `restoreDbFiles:${name}`);
      }
    },

    async listPresentDbFiles(): Promise<string[]> {
      const present: string[] = [];
      for (const name of APP_DB_RELATED_FILES) {
        const result = await runDockerCommand([
          'run',
          '--rm',
          '--entrypoint',
          'sh',
          '-v',
          `${appDataVolumeName(composeProjectName)}:${DOCKER_APP_DATA_MOUNT}`,
          utilityImage,
          '-ec',
          `if [ -f ${shellQuote(`${DOCKER_APP_DATA_MOUNT}/${name}`)} ]; then exit 0; else exit 1; fi`,
        ]);
        if (result.code === 0) {
          present.push(name);
        } else if (result.code !== 1) {
          assertDockerSuccess(result, `listPresentDbFiles:${name}`);
        }
      }
      return present;
    },
  };
}

export async function appDbExistsInVolume(
  composeProjectName: string,
  utilityImage: string,
): Promise<boolean> {
  if (!utilityImage.trim()) {
    return false;
  }
  const result = await runDockerCommand([
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    '-v',
    `${appDataVolumeName(composeProjectName)}:${DOCKER_APP_DATA_MOUNT}`,
    utilityImage,
    '-ec',
    `if [ -f ${shellQuote(APP_DB_PATH)} ]; then exit 0; else exit 1; fi`,
  ]);
  if (result.code === 0) {
    return true;
  }
  if (result.code === 1) {
    return false;
  }
  assertDockerSuccess(result, 'appDbExistsInVolume');
  return false;
}
