import type { BrowserWindow, OpenDialogOptions } from 'electron';
import { dialog } from 'electron';
import type { SelectFolderResult } from '../shared/host-status.js';

export async function selectFolderDialog(
  parentWindow: BrowserWindow | null,
  defaultPath?: string,
): Promise<SelectFolderResult> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Ordner wählen',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath?.trim() || undefined,
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  return { canceled: false, path: result.filePaths[0] ?? null };
}
