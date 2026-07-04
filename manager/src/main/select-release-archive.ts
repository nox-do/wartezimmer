import type { BrowserWindow, OpenDialogOptions } from 'electron';
import { dialog } from 'electron';
import type { SelectReleaseArchiveResult } from '../shared/host-status.js';

export async function selectReleaseArchiveDialog(
  parentWindow: BrowserWindow | null,
): Promise<SelectReleaseArchiveResult> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Praxis-Flow Release-Paket wählen',
    properties: ['openFile'],
    filters: [
      { name: 'Praxis Flow Images', extensions: ['tar', 'gz', 'tgz'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  return { canceled: false, path: result.filePaths[0] ?? null };
}
