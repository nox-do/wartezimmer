import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PFBACKUP_FILE_EXTENSION, PFBACKUP_BASENAME_PREFIX } from '@praxis-flow/server-shared';
import type { PfbackupInspectResult, SavePfbackupResult } from '../shared/host-status.js';
import { callSetupApi } from './setup-api.js';

function assertAllowedPfbackupPath(backupPath: string): string {
  if (typeof backupPath !== 'string' || !backupPath.trim()) {
    throw new Error('Ungültiger Backup-Pfad.');
  }

  const normalized = path.resolve(backupPath.trim());
  const base = path.basename(normalized);
  if (!base.startsWith(PFBACKUP_BASENAME_PREFIX) || !base.endsWith(`.${PFBACKUP_FILE_EXTENSION}`)) {
    throw new Error('Ungültiger Backup-Pfad.');
  }

  if (!fs.existsSync(normalized)) {
    throw new Error('Backup-Datei nicht gefunden.');
  }

  return normalized;
}

export async function savePfbackupToDisk(
  parentWindow: BrowserWindow | null,
  backupPath: string,
): Promise<SavePfbackupResult> {
  const sourcePath = assertAllowedPfbackupPath(backupPath);
  const defaultName = path.basename(sourcePath);

  const dialogOptions: SaveDialogOptions = {
    title: 'Praxis-Backup sichern',
    defaultPath: defaultName,
    filters: [
      { name: 'Praxis Flow Backup', extensions: [PFBACKUP_FILE_EXTENSION] },
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

export async function readPfbackupFromDialog(
  parentWindow: BrowserWindow | null,
): Promise<
  { canceled: true; content: null } | { canceled: false; content: string; filePath: string }
> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Praxis-Backup prüfen',
    properties: ['openFile'],
    filters: [
      { name: 'Praxis Flow Backup', extensions: [PFBACKUP_FILE_EXTENSION] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  };

  const { canceled, filePaths } = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (canceled || !filePaths[0]) {
    return { canceled: true, content: null };
  }

  const filePath = filePaths[0];
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    throw new Error(
      'Backup-Datei konnte nicht gelesen werden. Prüfen Sie, ob die Datei und der Datenträger noch verfügbar sind.',
    );
  }
  return {
    canceled: false,
    content,
    filePath,
  };
}

export async function inspectPfbackupFile(
  apiBase: string,
  backupPath: string,
  token?: string | null,
): Promise<PfbackupInspectResult> {
  const sourcePath = assertAllowedPfbackupPath(backupPath);
  const content = await fs.promises.readFile(sourcePath, 'utf8');
  return callSetupApi<PfbackupInspectResult>(
    apiBase,
    {
      method: 'POST',
      path: '/api/setup/host/backup/inspect',
      body: {
        content,
      },
    },
    token,
  );
}
