import fs from 'node:fs';
import path from 'node:path';
import { siblingTlsSidecarBasename } from '@praxis-flow/server-shared';

export function siblingTlsSidecarPath(backupPath: string): string | null {
  const name = siblingTlsSidecarBasename(backupPath);
  if (!name) {
    return null;
  }
  return path.join(path.dirname(path.resolve(backupPath)), name);
}

export function readTlsSidecarBase64BesideBackup(backupPath: string): string | null {
  const sidecarPath = siblingTlsSidecarPath(backupPath);
  if (!sidecarPath || !fs.existsSync(sidecarPath) || !fs.statSync(sidecarPath).isFile()) {
    return null;
  }
  return fs.readFileSync(sidecarPath).toString('base64');
}

export function copyTlsSidecarBesideExportedBackup(
  sourceBackupPath: string,
  destBackupPath: string,
): void {
  const sourceSidecar = siblingTlsSidecarPath(sourceBackupPath);
  if (!sourceSidecar || !fs.existsSync(sourceSidecar) || !fs.statSync(sourceSidecar).isFile()) {
    return;
  }
  const destDir = path.dirname(path.resolve(destBackupPath));
  const destSidecar =
    siblingTlsSidecarPath(destBackupPath) ?? path.join(destDir, path.basename(sourceSidecar));
  if (path.resolve(sourceSidecar) === path.resolve(destSidecar)) {
    return;
  }
  fs.copyFileSync(sourceSidecar, destSidecar);
}
