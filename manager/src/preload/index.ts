import { contextBridge, ipcRenderer } from 'electron';
import managerPackage from '../../package.json' with { type: 'json' };
import type {
  ApplySetupInput,
  ApplySetupResult,
  ComposeActionResult,
  ComposeLogsResult,
  ComposeStatus,
  PfbackupInfo,
  PfbackupResult,
  PfbackupValidateResult,
  PfbackupInspectResult,
  PfbackupRestoreResult,
  SavePfbackupResult,
  LoadDeliveryImagesResult,
  PfupdateApplyInput,
  PfupdateApplyResult,
  PfupdateInspectInput,
  PfupdateInspectResult,
  SelectFolderResult,
  SelectReleaseArchiveResult,
  SelectPfupdateArchiveResult,
  TlsPemSetupResult,
  StorageFoldersInput,
  StorageFoldersResult,
  HostNetworkInput,
  HostNetworkResult,
  HostStatus,
  HostRuntimeHealth,
  NetworkSnapshot,
  ResetStaffPinsResult,
  SetupPlan,
  SetupPlanInput,
  SetupProbesResult,
  TlsActionResult,
  TlsPrepareInput,
  TlsPrepareResult,
  TlsVerifyDnsResult,
} from '../shared/host-status.js';
import {
  IPC_FETCH_SETUP_STATUS,
  IPC_GET_SETUP_API_BASE,
  IPC_OPEN_EXTERNAL_URL,
  IPC_READ_PFBACKUP_FOR_VALIDATE,
  IPC_READ_TLS_SIDECAR,
  IPC_SAVE_TLS_SIDECAR,
  IPC_INSPECT_PFBACKUP_FILE,
  IPC_SAVE_PFBACKUP,
  IPC_SELECT_FOLDER,
  IPC_SELECT_RELEASE_ARCHIVE,
  IPC_SELECT_PFUPDATE_ARCHIVE,
  IPC_STAGE_TLS_PEM,
  IPC_RENEW_TLS_PEM,
  IPC_SETUP_API_CALL,
  type SetupApiCallRequest,
} from '../shared/ipc-channels.js';
import { SETUP_TLS_ROUTES } from '@praxis-flow/server-shared/setup-api';

const managerVersion = managerPackage.version;

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
): Promise<ComposeActionResult> {
  return callSetupApi<ComposeActionResult>({
    method: 'POST',
    path: '/api/setup/host/compose',
    body: { action },
  });
}

async function createPfbackup(): Promise<PfbackupResult> {
  return callSetupApi<PfbackupResult>({
    method: 'POST',
    path: '/api/setup/host/backup',
  });
}

async function getPfbackupInfo(): Promise<PfbackupInfo> {
  return callSetupApi<PfbackupInfo>({
    method: 'GET',
    path: '/api/setup/host/backup',
  });
}

async function savePfbackup(backupPath: string): Promise<SavePfbackupResult> {
  return invokeMain<SavePfbackupResult>(IPC_SAVE_PFBACKUP, backupPath);
}

async function readPfbackupForValidate(): Promise<
  | { canceled: true }
  | { canceled: false; content: string; filePath: string; tlsSidecarBase64: string | null }
> {
  return invokeMain(IPC_READ_PFBACKUP_FOR_VALIDATE);
}

async function readTlsSidecar(): Promise<
  { canceled: true } | { canceled: false; tlsSidecarBase64: string }
> {
  return invokeMain(IPC_READ_TLS_SIDECAR);
}

async function saveTlsSidecar(backupPath: string): Promise<SavePfbackupResult> {
  return invokeMain<SavePfbackupResult>(IPC_SAVE_TLS_SIDECAR, backupPath);
}

async function inspectPfbackupFile(backupPath: string): Promise<PfbackupInspectResult> {
  return invokeMain<PfbackupInspectResult>(IPC_INSPECT_PFBACKUP_FILE, backupPath);
}

async function validatePfbackup(content: string): Promise<PfbackupValidateResult> {
  return callSetupApi<PfbackupValidateResult>({
    method: 'POST',
    path: '/api/setup/host/backup/validate',
    body: { content },
  });
}

async function inspectPfbackup(
  content: string,
  options: { tlsSidecarBase64?: string } = {},
): Promise<PfbackupInspectResult> {
  return callSetupApi<PfbackupInspectResult>({
    method: 'POST',
    path: '/api/setup/host/backup/inspect',
    body: {
      content,
      ...(options.tlsSidecarBase64 ? { tlsSidecarBase64: options.tlsSidecarBase64 } : {}),
    },
  });
}

async function restorePfbackup(
  content: string,
  options: { skipProviderCredentials?: boolean; tlsSidecarBase64?: string } = {},
): Promise<PfbackupRestoreResult> {
  return callSetupApi<PfbackupRestoreResult>({
    method: 'POST',
    path: '/api/setup/host/backup/restore',
    body: {
      content,
      skipProviderCredentials: options.skipProviderCredentials === true,
      ...(options.tlsSidecarBase64 ? { tlsSidecarBase64: options.tlsSidecarBase64 } : {}),
    },
  });
}

async function selectFolder(defaultPath?: string): Promise<SelectFolderResult> {
  return invokeMain<SelectFolderResult>(IPC_SELECT_FOLDER, defaultPath);
}

async function selectReleaseArchive(): Promise<SelectReleaseArchiveResult> {
  return invokeMain<SelectReleaseArchiveResult>(IPC_SELECT_RELEASE_ARCHIVE);
}

async function selectPfupdateArchive(): Promise<SelectPfupdateArchiveResult> {
  return invokeMain<SelectPfupdateArchiveResult>(IPC_SELECT_PFUPDATE_ARCHIVE);
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

async function inspectPfupdate(body: PfupdateInspectInput): Promise<PfupdateInspectResult> {
  return callSetupApi<PfupdateInspectResult>({
    method: 'POST',
    path: '/api/setup/host/update/inspect',
    body: {
      ...body,
      managerVersion,
    },
  });
}

async function applyPfupdate(body: PfupdateApplyInput): Promise<PfupdateApplyResult> {
  return callSetupApi<PfupdateApplyResult>({
    method: 'POST',
    path: '/api/setup/host/update/apply',
    body: {
      ...body,
      managerVersion,
    },
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

async function prepareHostTls(body: TlsPrepareInput): Promise<TlsPrepareResult> {
  return callSetupApi<TlsPrepareResult>({ method: 'POST', path: SETUP_TLS_ROUTES.prepare, body });
}

async function verifyHostTlsDns(): Promise<TlsVerifyDnsResult> {
  return callSetupApi<TlsVerifyDnsResult>({ method: 'POST', path: SETUP_TLS_ROUTES.verifyDns });
}

async function obtainHostTlsCertificate(): Promise<TlsActionResult> {
  return callSetupApi<TlsActionResult>({
    method: 'POST',
    path: SETUP_TLS_ROUTES.obtainCertificate,
  });
}

async function stageHostTlsCertificate(): Promise<TlsPemSetupResult> {
  return invokeMain<TlsPemSetupResult>(IPC_STAGE_TLS_PEM);
}

async function checkHostTlsCertificate(): Promise<TlsActionResult> {
  return callSetupApi<TlsActionResult>({ method: 'POST', path: SETUP_TLS_ROUTES.checkCertificate });
}

async function applyHostTls(): Promise<TlsActionResult> {
  return callSetupApi<TlsActionResult>({ method: 'POST', path: SETUP_TLS_ROUTES.apply });
}

async function repairHostTls(): Promise<TlsActionResult> {
  return callSetupApi<TlsActionResult>({ method: 'POST', path: SETUP_TLS_ROUTES.repair });
}

async function resetHostTls(): Promise<TlsActionResult> {
  return callSetupApi<TlsActionResult>({ method: 'POST', path: SETUP_TLS_ROUTES.reset });
}

async function renewHostTls(): Promise<TlsActionResult> {
  return callSetupApi<TlsActionResult>({
    method: 'POST',
    path: SETUP_TLS_ROUTES.renew,
    body: {},
  });
}

async function renewHostTlsFromPem(): Promise<TlsPemSetupResult> {
  return invokeMain<TlsPemSetupResult>(IPC_RENEW_TLS_PEM);
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
  createPfbackup,
  savePfbackup,
  saveTlsSidecar,
  inspectPfbackupFile,
  readPfbackupForValidate,
  readTlsSidecar,
  validatePfbackup,
  inspectPfbackup,
  restorePfbackup,
  selectFolder,
  selectReleaseArchive,
  selectPfupdateArchive,
  inspectPfupdate,
  loadDeliveryImages,
  applyPfupdate,
  saveStorageFolders,
  saveHostNetwork,
  prepareHostTls,
  verifyHostTlsDns,
  obtainHostTlsCertificate,
  stageHostTlsCertificate,
  checkHostTlsCertificate,
  applyHostTls,
  repairHostTls,
  resetHostTls,
  renewHostTls,
  renewHostTlsFromPem,
  getPfbackupInfo,
  resetStaffPins,
  runSetupProbes,
  openExternalUrl,
});
