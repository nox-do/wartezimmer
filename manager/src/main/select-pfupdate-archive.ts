import type { BrowserWindow, OpenDialogOptions } from 'electron';
import { dialog } from 'electron';
import type { SelectPfupdateArchiveResult } from '../shared/host-status.js';

export async function selectPfupdateArchiveDialog(
  parentWindow: BrowserWindow | null,
): Promise<SelectPfupdateArchiveResult> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Wartezimmer Update-Paket wählen',
    properties: ['openFile'],
    filters: [{ name: 'Wartezimmer Update', extensions: ['pfupdate'] }],
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  const selectedPath = result.filePaths[0] ?? null;
  if (!selectedPath?.toLowerCase().endsWith('.pfupdate')) {
    return { canceled: true, path: null };
  }
  return { canceled: false, path: selectedPath };
}
