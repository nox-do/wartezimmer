import type { BrowserWindow, SaveDialogOptions } from 'electron';
import { dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ENV_BACKUP_BASENAME_PREFIX } from '@praxis-flow/server-shared';
import type { SavePfbackupResult } from '../shared/host-status.js';

function assertAllowedBackupPath(backupPath: string): string {
  if (typeof backupPath !== 'string' || !backupPath.trim()) {
    throw new Error('Ungültiger Backup-Pfad.');
  }

  const normalized = path.resolve(backupPath.trim());
  const base = path.basename(normalized);
  if (!base.startsWith(ENV_BACKUP_BASENAME_PREFIX)) {
    throw new Error('Ungültiger Backup-Pfad.');
  }

  if (!fs.existsSync(normalized)) {
    throw new Error('Backup-Datei nicht gefunden.');
  }

  return normalized;
}

export async function saveEnvBackupToDisk(
  parentWindow: BrowserWindow | null,
  backupPath: string,
): Promise<SavePfbackupResult> {
  const sourcePath = assertAllowedBackupPath(backupPath);
  const base = path.basename(sourcePath);
  const defaultName = base.startsWith('.') ? `praxis-flow${base}` : base;

  const dialogOptions: SaveDialogOptions = {
    title: '.env sichern',
    defaultPath: defaultName,
    filters: [
      { name: 'Env-Dateien', extensions: ['env'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  };

  const { canceled, filePath } = parentWindow
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (canceled || !filePath) {
    return { saved: false, canceled: true, filePath: null };
  }

  await fs.promises.copyFile(sourcePath, filePath);
  return { saved: true, canceled: false, filePath };
}
