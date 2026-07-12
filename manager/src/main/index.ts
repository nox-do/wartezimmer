import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IPC_FETCH_SETUP_STATUS,
  IPC_GET_SETUP_API_BASE,
  IPC_OPEN_EXTERNAL_URL,
  IPC_READ_PFBACKUP_FOR_VALIDATE,
  IPC_SAVE_PFBACKUP,
  IPC_SELECT_FOLDER,
  IPC_SELECT_RELEASE_ARCHIVE,
  IPC_SELECT_PFUPDATE_ARCHIVE,
  IPC_SETUP_API_CALL,
  type SetupApiCallRequest,
} from '../shared/ipc-channels.js';
import { selectFolderDialog } from './select-folder.js';
import { selectReleaseArchiveDialog } from './select-release-archive.js';
import { selectPfupdateArchiveDialog } from './select-pfupdate-archive.js';
import { installMacApplicationMenu } from './mac-app-menu.js';
import { fetchHostStatusFromApi, callSetupApi } from './setup-api.js';
import { readPfbackupFromDialog, savePfbackupToDisk } from './pfbackup-dialog.js';
import { startSetupServer, stopSetupServer, type SetupServerHandle } from './setup-server.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Affects internal paths / user agent; macOS menu bar still reads CFBundleName from Electron.app in dev.
app.setName('Praxis Flow');

let setupHandle: SetupServerHandle | null = null;
let mainWindow: BrowserWindow | null = null;

function registerSetupIpc(handle: SetupServerHandle): void {
  ipcMain.handle(IPC_GET_SETUP_API_BASE, () => handle.apiBase);

  ipcMain.handle(IPC_FETCH_SETUP_STATUS, async () => {
    try {
      return await fetchHostStatusFromApi(handle.apiBase);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Setup-API nicht erreichbar (${handle.apiBase}): ${detail}`, {
        cause: error,
      });
    }
  });

  ipcMain.handle(IPC_SETUP_API_CALL, async (_event, request: SetupApiCallRequest) => {
    try {
      return await callSetupApi(handle.apiBase, request);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail, { cause: error });
    }
  });

  ipcMain.handle(IPC_OPEN_EXTERNAL_URL, async (_event, url: string) => {
    if (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      throw new Error('Ungültige URL');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC_SAVE_PFBACKUP, async (_event, backupPath: string) => {
    try {
      return await savePfbackupToDisk(mainWindow, backupPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail, { cause: error });
    }
  });

  ipcMain.handle(IPC_READ_PFBACKUP_FOR_VALIDATE, async () => {
    try {
      return await readPfbackupFromDialog(mainWindow);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail, { cause: error });
    }
  });

  ipcMain.handle(IPC_SELECT_FOLDER, async (_event, defaultPath?: string) => {
    try {
      return await selectFolderDialog(mainWindow, defaultPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail, { cause: error });
    }
  });

  ipcMain.handle(IPC_SELECT_RELEASE_ARCHIVE, async () => {
    try {
      return await selectReleaseArchiveDialog(mainWindow);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail, { cause: error });
    }
  });

  ipcMain.handle(IPC_SELECT_PFUPDATE_ARCHIVE, async () => {
    try {
      return await selectPfupdateArchiveDialog(mainWindow);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail, { cause: error });
    }
  });
}

function preloadScriptPath(): string {
  return path.join(moduleDir, '../preload/index.cjs');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 820,
    minWidth: 480,
    minHeight: 520,
    title: 'Praxis Flow Manager',
    webPreferences: {
      preload: preloadScriptPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(moduleDir, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap(): Promise<void> {
  try {
    setupHandle = await startSetupServer();
    registerSetupIpc(setupHandle);
    createWindow();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Setup-API konnte nicht gestartet werden.';
    dialog.showErrorBox('Praxis Flow Manager', message);
    app.quit();
  }
}

void app.whenReady().then(() => {
  installMacApplicationMenu();
  void bootstrap();
});

app.on('window-all-closed', () => {
  stopSetupServer(setupHandle);
  setupHandle = null;
  app.quit();
});

app.on('before-quit', () => {
  stopSetupServer(setupHandle);
  setupHandle = null;
});

app.on('activate', () => {
  if (mainWindow === null && setupHandle !== null) {
    createWindow();
  }
});
