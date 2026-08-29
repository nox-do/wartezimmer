import fs from 'node:fs/promises';
import type { BrowserWindow, OpenDialogOptions } from 'electron';
import { dialog } from 'electron';
import { SETUP_TLS_ROUTES } from '@praxis-flow/server-shared/setup-api';
import type { TlsActionResult, TlsPemSetupResult } from '../shared/host-status.js';
import { callSetupApi } from './setup-api.js';

async function selectTlsPemDialog(
  parentWindow: BrowserWindow | null,
  kind: 'fullchain' | 'key',
): Promise<{ canceled: true } | { canceled: false; content: string }> {
  const dialogOptions: OpenDialogOptions = {
    title: kind === 'fullchain' ? 'Zertifikat (PEM) wählen' : 'Privaten Schlüssel (PEM) wählen',
    properties: ['openFile'],
    filters: [
      { name: 'PEM', extensions: ['pem', 'crt', 'cer', 'key'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) {
    return { canceled: true };
  }

  const content = await fs.readFile(filePath, 'utf8');
  return { canceled: false, content };
}

async function pickPemPair(
  parentWindow: BrowserWindow | null,
): Promise<{ canceled: true } | { canceled: false; fullchainPem: string; privateKeyPem: string }> {
  const fullchain = await selectTlsPemDialog(parentWindow, 'fullchain');
  if (fullchain.canceled) {
    return { canceled: true };
  }
  const key = await selectTlsPemDialog(parentWindow, 'key');
  if (key.canceled) {
    return { canceled: true };
  }
  return { canceled: false, fullchainPem: fullchain.content, privateKeyPem: key.content };
}

export async function stageTlsCertificateFromPicker(
  parentWindow: BrowserWindow | null,
  apiBase: string,
): Promise<TlsPemSetupResult> {
  const pem = await pickPemPair(parentWindow);
  if (pem.canceled) {
    return { canceled: true };
  }
  const result = await callSetupApi<TlsActionResult>(apiBase, {
    method: 'POST',
    path: SETUP_TLS_ROUTES.customCertificate,
    body: { fullchainPem: pem.fullchainPem, privateKeyPem: pem.privateKeyPem },
  });
  return { canceled: false, tls: result.tls, checks: result.checks };
}

export async function renewTlsCertificateFromPicker(
  parentWindow: BrowserWindow | null,
  apiBase: string,
): Promise<TlsPemSetupResult> {
  const pem = await pickPemPair(parentWindow);
  if (pem.canceled) {
    return { canceled: true };
  }
  const result = await callSetupApi<TlsActionResult>(apiBase, {
    method: 'POST',
    path: SETUP_TLS_ROUTES.renew,
    body: { fullchainPem: pem.fullchainPem, privateKeyPem: pem.privateKeyPem },
  });
  return { canceled: false, tls: result.tls, checks: result.checks };
}
