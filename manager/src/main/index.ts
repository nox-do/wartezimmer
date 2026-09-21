import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IPC_OPEN_EXTERNAL_URL,
  IPC_READ_PFBACKUP_FOR_VALIDATE,
  IPC_INSPECT_PFBACKUP_FILE,
  IPC_SAVE_PFBACKUP,
  IPC_SELECT_FOLDER,
  IPC_SELECT_RELEASE_ARCHIVE,
  IPC_SELECT_PFUPDATE_ARCHIVE,
  IPC_STAGE_TLS_PEM,
  IPC_RENEW_TLS_PEM,
  IPC_SETUP_API_CALL,
  type SetupApiCallRequest,
  type SetupApiCallResponse,
} from '../shared/ipc-channels.js';
import { selectFolderDialog } from './select-folder.js';
import { selectReleaseArchiveDialog } from './select-release-archive.js';
import { selectPfupdateArchiveDialog } from './select-pfupdate-archive.js';
import { renewTlsCertificateFromPicker, stageTlsCertificateFromPicker } from './select-tls-pem.js';
import { installMacApplicationMenu } from './mac-app-menu.js';
import { installNavigationGuards } from './navigation-guards.js';
import { callSetupApi, setupApiUserErrorMessage } from './setup-api.js';
import {
  inspectPfbackupFile,
  readPfbackupFromDialog,
  savePfbackupToDisk,
} from './pfbackup-dialog.js';
import { startSetupServer, stopSetupServer, type SetupServerHandle } from './setup-server.js';
import { defaultOsInstallHome, expectedSetupInstallHome } from './setup-identity.js';
import { prepareManagerProfile } from './manager-profile.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Affects internal paths / user agent; macOS menu bar still reads CFBundleName from Electron.app in dev.
app.setName('Praxis Flow');

let setupHandle: SetupServerHandle | null = null;
let mainWindow: BrowserWindow | null = null;

function acquireSingleInstanceLock(): boolean {
  const installHome = expectedSetupInstallHome(app.isPackaged, moduleDir);
  try {
    const profile = prepareManagerProfile({
      // Dev profiles share the product root but stay isolated by repository/install.
      profileHome: app.isPackaged ? installHome : defaultOsInstallHome(),
      installHome,
      isPackaged: app.isPackaged,
    });
    app.setPath('userData', profile);
    app.setPath('sessionData', profile);
    app.setAppLogsPath(path.join(profile, 'logs'));
  } catch (error) {
    dialog.showErrorBox(
      'Praxis Flow Manager',
      `Manager-Profil konnte nicht eingerichtet werden: ${error instanceof Error ? error.message : String(error)}`,
    );
    app.quit();
    return false;
  }
  const gotLock = app.requestSingleInstanceLock({ installHome });
  if (!gotLock) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });
  return true;
}

function registerSetupIpc(handle: SetupServerHandle): void {
  ipcMain.handle(IPC_SETUP_API_CALL, async (_event, request: SetupApiCallRequest) => {
    try {
      const value = await callSetupApi(handle.apiBase, request, handle.token);
      return { ok: true, value } satisfies SetupApiCallResponse;
    } catch (error) {
      console.error(`Setup-API ${request.method} ${request.path} fehlgeschlagen:`, error);
      return {
        ok: false,
        message: setupApiUserErrorMessage(error, request),
      } satisfies SetupApiCallResponse;
    }
  });

  ipcMain.handle(IPC_OPEN_EXTERNAL_URL, async (_event, url: string) => {
    if (
      typeof url !== 'string' ||
      (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:'))
    ) {
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

  ipcMain.handle(IPC_INSPECT_PFBACKUP_FILE, async (_event, backupPath: string) => {
    try {
      return await inspectPfbackupFile(handle.apiBase, backupPath, handle.token);
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

  ipcMain.handle(IPC_STAGE_TLS_PEM, async () => {
    try {
      return await stageTlsCertificateFromPicker(mainWindow, handle.apiBase, handle.token);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail, { cause: error });
    }
  });

  ipcMain.handle(IPC_RENEW_TLS_PEM, async () => {
    try {
      return await renewTlsCertificateFromPicker(mainWindow, handle.apiBase, handle.token);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail, { cause: error });
    }
  });
}

function preloadScriptPath(): string {
  return path.join(moduleDir, '../preload/index.cjs');
}

function installSmokeCheck(window: BrowserWindow): void {
  if (process.env.PRAXIS_FLOW_MANAGER_SMOKE !== '1') {
    return;
  }
  window.webContents.once('did-finish-load', () => {
    void window.webContents
      .executeJavaScript(
        `(async () => {
        const api = window.praxisManager;
        if (!api || typeof api.fetchSetupStatus !== 'function') {
          throw new Error('Preload API missing');
        }
        const status = await api.fetchSetupStatus();
        return { installationKind: status?.installation?.kind ?? null };
      })()`,
      )
      .then((result: unknown) => {
        console.log(`PRAXIS_FLOW_MANAGER_SMOKE_OK ${JSON.stringify(result)}`);
        app.exit(0);
      })
      .catch((error: unknown) => {
        console.error(
          `PRAXIS_FLOW_MANAGER_SMOKE_FAILED ${error instanceof Error ? error.message : String(error)}`,
        );
        app.exit(1);
      });
  });
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

  installNavigationGuards(mainWindow.webContents);
  installSmokeCheck(mainWindow);

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

if (acquireSingleInstanceLock()) {
  void app.whenReady().then(() => {
    installMacApplicationMenu();
    void bootstrap();
  });
}

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
