import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PFBACKUP_FILE_EXTENSION, PFBACKUP_BASENAME_PREFIX } from '@praxis-flow/server-shared';
import type { PfbackupInspectResult, SavePfbackupResult } from '../shared/host-status.js';
import { callSetupApi } from './setup-api.js';
import {
  copyTlsSidecarBesideExportedBackup,
  readTlsSidecarBase64BesideBackup,
  siblingTlsSidecarPath,
} from './tls-sidecar-lookup.js';

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
  copyTlsSidecarBesideExportedBackup(sourcePath, filePath);
  return { saved: true, canceled: false, filePath };
}

export async function readPfbackupFromDialog(
  parentWindow: BrowserWindow | null,
): Promise<
  | { canceled: true; content: null }
  | { canceled: false; content: string; filePath: string; tlsSidecarBase64: string | null }
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
  const content = await fs.promises.readFile(filePath, 'utf8');
  return {
    canceled: false,
    content,
    filePath,
    tlsSidecarBase64: readTlsSidecarBase64BesideBackup(filePath),
  };
}

export async function readTlsSidecarFromDialog(
  parentWindow: BrowserWindow | null,
): Promise<
  { canceled: true; tlsSidecarBase64: null } | { canceled: false; tlsSidecarBase64: string }
> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Zertifikatsdatei wählen',
    properties: ['openFile'],
    filters: [
      { name: 'Praxis Flow Zertifikat', extensions: ['tgz', 'tar.gz'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  };

  const { canceled, filePaths } = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (canceled || !filePaths[0]) {
    return { canceled: true, tlsSidecarBase64: null };
  }

  const bytes = await fs.promises.readFile(filePaths[0]);
  return { canceled: false, tlsSidecarBase64: bytes.toString('base64') };
}

export async function saveTlsSidecarToDisk(
  parentWindow: BrowserWindow | null,
  backupPath: string,
): Promise<SavePfbackupResult> {
  const sourceSidecar = backupPath.endsWith('.tgz')
    ? path.resolve(backupPath)
    : siblingTlsSidecarPath(assertAllowedPfbackupPath(backupPath));

  if (!sourceSidecar || !fs.existsSync(sourceSidecar)) {
    throw new Error('Zertifikatsdatei nicht gefunden.');
  }

  const dialogOptions: SaveDialogOptions = {
    title: 'Zertifikatsdatei sichern',
    defaultPath: path.basename(sourceSidecar),
    filters: [
      { name: 'Praxis Flow Zertifikat', extensions: ['tgz'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  };

  const { canceled, filePath } = parentWindow
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (canceled || !filePath) {
    return { saved: false, canceled: true, filePath: null };
  }

  await fs.promises.copyFile(sourceSidecar, filePath);
  return { saved: true, canceled: false, filePath };
}

export async function inspectPfbackupFile(
  apiBase: string,
  backupPath: string,
  token?: string | null,
): Promise<PfbackupInspectResult> {
  const sourcePath = assertAllowedPfbackupPath(backupPath);
  const content = await fs.promises.readFile(sourcePath, 'utf8');
  const tlsSidecarBase64 = readTlsSidecarBase64BesideBackup(sourcePath);
  return callSetupApi<PfbackupInspectResult>(
    apiBase,
    {
      method: 'POST',
      path: '/api/setup/host/backup/inspect',
      body: {
        content,
        ...(tlsSidecarBase64 ? { tlsSidecarBase64 } : {}),
      },
    },
    token,
  );
}
