import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApplySetupInput,
  ApplySetupResult,
  ComposeActionResult,
  ComposeLogsResult,
  ComposeStatus,
  EnvBackupInfo,
  EnvBackupResult,
  SaveEnvBackupResult,
  LoadDeliveryImagesResult,
  SelectFolderResult,
  SelectReleaseArchiveResult,
  StorageFoldersInput,
  StorageFoldersResult,
  HostNetworkInput,
  HostNetworkResult,
  HostStatus,
  HostRuntimeHealth,
  NetworkSnapshot,
  ResetStaffPinsResult,
  RoutingModeCapabilities,
  SetRoutingModeInput,
  SetRoutingModeResult,
  SetupPlan,
  SetupPlanInput,
  SetupProbesResult,
} from '../shared/host-status.js';
import {
  IPC_FETCH_SETUP_STATUS,
  IPC_GET_SETUP_API_BASE,
  IPC_OPEN_EXTERNAL_URL,
  IPC_SAVE_ENV_BACKUP,
  IPC_SELECT_FOLDER,
  IPC_SELECT_RELEASE_ARCHIVE,
  IPC_SETUP_API_CALL,
  type SetupApiCallRequest,
} from '../shared/ipc-channels.js';

async function invokeMain<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function assertLocalhostApiBase(apiBase: string): void {
  const url = new URL(apiBase);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('Setup-API nur auf localhost erlaubt');
  }
}

async function getSetupApiBase(): Promise<string> {
  const apiBase = await invokeMain<string>(IPC_GET_SETUP_API_BASE);
  assertLocalhostApiBase(apiBase);
  return apiBase;
}

async function callSetupApi<T>(request: SetupApiCallRequest): Promise<T> {
  return invokeMain<T>(IPC_SETUP_API_CALL, request);
}

async function fetchSetupStatus(options?: { includeProbes?: boolean }): Promise<HostStatus> {
  if (options?.includeProbes) {
    return callSetupApi<HostStatus>({
      method: 'GET',
      path: '/api/setup/host/status?include=probes',
    });
  }
  return invokeMain<HostStatus>(IPC_FETCH_SETUP_STATUS);
}

async function fetchRuntimeHealth(): Promise<HostRuntimeHealth> {
  return callSetupApi<HostRuntimeHealth>({
    method: 'GET',
    path: '/api/setup/host/runtime-health',
  });
}

async function fetchSetupNetwork(): Promise<NetworkSnapshot> {
  return callSetupApi<NetworkSnapshot>({
    method: 'GET',
    path: '/api/setup/host/network',
  });
}

async function fetchSetupPlan(body: SetupPlanInput): Promise<SetupPlan> {
  return callSetupApi<SetupPlan>({
    method: 'POST',
    path: '/api/setup/host/plan',
    body,
  });
}

async function applySetupPlan(body: ApplySetupInput): Promise<ApplySetupResult> {
  return callSetupApi<ApplySetupResult>({
    method: 'POST',
    path: '/api/setup/host/apply',
    body,
  });
}

async function getComposeStatus(): Promise<ComposeStatus> {
  return callSetupApi<ComposeStatus>({
    method: 'GET',
    path: '/api/setup/host/compose',
  });
}

async function getComposeLogs(service?: string, tail?: number): Promise<ComposeLogsResult> {
  const params = new URLSearchParams();
  if (service?.trim()) {
    params.set('service', service.trim());
  }
  if (tail !== undefined) {
    params.set('tail', String(tail));
  }
  const query = params.toString();
  return callSetupApi<ComposeLogsResult>({
    method: 'GET',
    path: `/api/setup/host/compose/logs${query ? `?${query}` : ''}`,
  });
}

async function runComposeAction(
  action: 'start' | 'stop' | 'restart',
  build?: boolean,
): Promise<ComposeActionResult> {
  return callSetupApi<ComposeActionResult>({
    method: 'POST',
    path: '/api/setup/host/compose',
    body: { action, build: Boolean(build) },
  });
}

async function backupEnv(): Promise<EnvBackupResult> {
  return callSetupApi<EnvBackupResult>({
    method: 'POST',
    path: '/api/setup/host/backup',
    body: { target: 'env' },
  });
}

async function getEnvBackupInfo(): Promise<EnvBackupInfo> {
  return callSetupApi<EnvBackupInfo>({
    method: 'GET',
    path: '/api/setup/host/backup',
  });
}

async function saveEnvBackup(backupPath: string): Promise<SaveEnvBackupResult> {
  return invokeMain<SaveEnvBackupResult>(IPC_SAVE_ENV_BACKUP, backupPath);
}

async function selectFolder(defaultPath?: string): Promise<SelectFolderResult> {
  return invokeMain<SelectFolderResult>(IPC_SELECT_FOLDER, defaultPath);
}

async function selectReleaseArchive(): Promise<SelectReleaseArchiveResult> {
  return invokeMain<SelectReleaseArchiveResult>(IPC_SELECT_RELEASE_ARCHIVE);
}

async function loadDeliveryImages(body: {
  archivePath: string;
  restartCompose?: boolean;
}): Promise<LoadDeliveryImagesResult> {
  return callSetupApi<LoadDeliveryImagesResult>({
    method: 'POST',
    path: '/api/setup/host/images/load',
    body,
  });
}

async function saveStorageFolders(body: StorageFoldersInput): Promise<StorageFoldersResult> {
  return callSetupApi<StorageFoldersResult>({
    method: 'POST',
    path: '/api/setup/host/storage',
    body,
  });
}

async function saveHostNetwork(body: HostNetworkInput): Promise<HostNetworkResult> {
  return callSetupApi<HostNetworkResult>({
    method: 'POST',
    path: '/api/setup/host/network',
    body,
  });
}

async function runSetupProbes(body: {
  localAppBaseUrl?: string;
  lanAppBaseUrl?: string;
}): Promise<SetupProbesResult> {
  return callSetupApi<SetupProbesResult>({
    method: 'POST',
    path: '/api/setup/host/probes',
    body,
  });
}

async function resetStaffPins(): Promise<ResetStaffPinsResult> {
  return callSetupApi<ResetStaffPinsResult>({
    method: 'POST',
    path: '/api/setup/host/reset-staff-pins',
    body: {},
  });
}

async function getRoutingMode(): Promise<RoutingModeCapabilities> {
  return callSetupApi<RoutingModeCapabilities>({
    method: 'GET',
    path: '/api/setup/host/routing-mode',
  });
}

async function setRoutingMode(body: SetRoutingModeInput): Promise<SetRoutingModeResult> {
  return callSetupApi<SetRoutingModeResult>({
    method: 'POST',
    path: '/api/setup/host/routing-mode',
    body,
  });
}

async function openExternalUrl(url: string): Promise<void> {
  await invokeMain<void>(IPC_OPEN_EXTERNAL_URL, url);
}

contextBridge.exposeInMainWorld('praxisManager', {
  hostPlatform: process.platform,
  getSetupApiBase,
  fetchSetupStatus,
  fetchRuntimeHealth,
  fetchSetupNetwork,
  fetchSetupPlan,
  applySetupPlan,
  getComposeStatus,
  getComposeLogs,
  runComposeAction,
  backupEnv,
  saveEnvBackup,
  selectFolder,
  selectReleaseArchive,
  loadDeliveryImages,
  saveStorageFolders,
  saveHostNetwork,
  getEnvBackupInfo,
  resetStaffPins,
  getRoutingMode,
  setRoutingMode,
  runSetupProbes,
  openExternalUrl,
});
