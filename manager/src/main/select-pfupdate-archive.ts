import type { BrowserWindow, OpenDialogOptions } from 'electron';
import { dialog } from 'electron';
import type { SelectPfupdateArchiveResult } from '../shared/host-status.js';

export async function selectPfupdateArchiveDialog(
  parentWindow: BrowserWindow | null,
): Promise<SelectPfupdateArchiveResult> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Praxis-Flow Update-Paket wählen',
    properties: ['openFile'],
    filters: [
      { name: 'Praxis Flow Update', extensions: ['pfupdate'] },
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
