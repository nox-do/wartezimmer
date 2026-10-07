import type { BrowserWindow, OpenDialogOptions } from 'electron';
import { dialog } from 'electron';
import type { SelectReleaseArchiveResult } from '../shared/host-status.js';

export async function selectReleaseArchiveDialog(
  parentWindow: BrowserWindow | null,
): Promise<SelectReleaseArchiveResult> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Wartezimmer Release-Paket wählen',
    properties: ['openFile'],
    filters: [{ name: 'Wartezimmer Erstinstallation', extensions: ['pfinstall'] }],
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  const selectedPath = result.filePaths[0] ?? null;
  if (!selectedPath?.toLowerCase().endsWith('.pfinstall')) {
    return { canceled: true, path: null };
  }
  return { canceled: false, path: selectedPath };
}
