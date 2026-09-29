import { serializeManagerApiErrors } from '../shared/manager-api-bridge.js';
import type {
  RecoveryBackupCandidate,
  InstallRecoveryPreview,
  InstallFinishInput,
  InstallFinishResult,
} from '../shared/host-status.js';
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
  InstallationStartResult,
  InstallPrepareInput,
  InstallPrepareResult,
  InstallCommitInput,
  InstallCommitResult,
  InstallAbortResult,
  NetworkSnapshot,
  RestrictedNetworkInspectResult,
  RestrictedNetworkActionResult,
  RestrictedNetworkPrepareInput,
  RestrictedNetworkPrepareResult,
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
  IPC_OPEN_EXTERNAL_URL,
  IPC_SELECT_PFBACKUP_FOR_RESTORE,
  IPC_SAVE_PFBACKUP,
  IPC_SELECT_FOLDER,
  IPC_SELECT_RELEASE_ARCHIVE,
  IPC_SELECT_PFUPDATE_ARCHIVE,
  IPC_STAGE_TLS_PEM,
  IPC_RENEW_TLS_PEM,
  IPC_SETUP_API_CALL,
  unwrapSetupApiResponse,
  type SetupApiCallRequest,
  type SetupApiCallResponse,
} from '../shared/ipc-channels.js';
import {
  SETUP_RESTRICTED_NETWORK_ROUTES,
  SETUP_TLS_ROUTES,
} from '@praxis-flow/server-shared/setup-api';

const managerVersion = managerPackage.version;

async function invokeMain<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

async function callSetupApi<T>(request: SetupApiCallRequest): Promise<T> {
  const response = await invokeMain<SetupApiCallResponse<T>>(IPC_SETUP_API_CALL, request);
  return unwrapSetupApiResponse(response);
}

async function fetchSetupStatus(options?: { includeProbes?: boolean }): Promise<HostStatus> {
  return callSetupApi<HostStatus>({
    method: 'GET',
    path: options?.includeProbes
      ? '/api/setup/host/status?include=probes'
      : '/api/setup/host/status',
  });
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

async function inspectRestrictedNetwork(): Promise<RestrictedNetworkInspectResult> {
  return callSetupApi<RestrictedNetworkInspectResult>({
    method: 'GET',
    path: SETUP_RESTRICTED_NETWORK_ROUTES.inspect,
  });
}

async function prepareRestrictedNetwork(
  body: RestrictedNetworkPrepareInput,
): Promise<RestrictedNetworkPrepareResult> {
  return callSetupApi<RestrictedNetworkPrepareResult>({
    method: 'POST',
    path: SETUP_RESTRICTED_NETWORK_ROUTES.prepare,
    body,
  });
}

async function applyRestrictedNetwork(): Promise<RestrictedNetworkActionResult> {
  return callSetupApi<RestrictedNetworkActionResult>({
    method: 'POST',
    path: SETUP_RESTRICTED_NETWORK_ROUTES.apply,
    body: {},
  });
}

async function removeRestrictedNetwork(): Promise<RestrictedNetworkActionResult> {
  return callSetupApi<RestrictedNetworkActionResult>({
    method: 'POST',
    path: SETUP_RESTRICTED_NETWORK_ROUTES.remove,
    body: {},
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

async function selectPfbackupForRestore(): Promise<
  { canceled: true } | { canceled: false; content: string; filePath: string }
> {
  return invokeMain(IPC_SELECT_PFBACKUP_FOR_RESTORE);
}

async function inspectPfbackup(content: string): Promise<PfbackupInspectResult> {
  return callSetupApi<PfbackupInspectResult>({
    method: 'POST',
    path: '/api/setup/host/backup/inspect',
    body: {
      content,
    },
  });
}

async function restorePfbackup(
  content: string,
  options: { skipProviderCredentials?: boolean } = {},
): Promise<PfbackupRestoreResult> {
  return callSetupApi<PfbackupRestoreResult>({
    method: 'POST',
    path: '/api/setup/host/backup/restore',
    body: {
      content,
      skipProviderCredentials: options.skipProviderCredentials === true,
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

async function startStoppedInstallation(): Promise<InstallationStartResult> {
  return callSetupApi<InstallationStartResult>({
    method: 'POST',
    path: '/api/setup/host/installation/start',
    body: {},
  });
}

async function prepareInstall(body: InstallPrepareInput): Promise<InstallPrepareResult> {
  return callSetupApi<InstallPrepareResult>({
    method: 'POST',
    path: '/api/setup/host/install/prepare',
    body,
  });
}

async function commitInstall(body: InstallCommitInput): Promise<InstallCommitResult> {
  return callSetupApi<InstallCommitResult>({
    method: 'POST',
    path: '/api/setup/host/install/commit',
    body,
  });
}

async function abortInstall(operationId: string): Promise<InstallAbortResult> {
  return callSetupApi<InstallAbortResult>({
    method: 'DELETE',
    path: '/api/setup/host/install/operation',
    body: { operationId },
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
  return unwrapSetupApiResponse(
    await invokeMain<SetupApiCallResponse<TlsPemSetupResult>>(IPC_STAGE_TLS_PEM),
  );
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
  return unwrapSetupApiResponse(
    await invokeMain<SetupApiCallResponse<TlsPemSetupResult>>(IPC_RENEW_TLS_PEM),
  );
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

const api = serializeManagerApiErrors({
  hostPlatform: process.platform,
  fetchSetupStatus,
  fetchRuntimeHealth,
  fetchSetupNetwork,
  startStoppedInstallation,
  prepareInstall,
  commitInstall,
  abortInstall,
  discoverRecoveryBackups: () =>
    callSetupApi<RecoveryBackupCandidate[]>({
      method: 'GET',
      path: '/api/setup/host/install/backups',
    }),
  previewInstallRecovery: (operationId: string) =>
    callSetupApi<InstallRecoveryPreview>({
      method: 'POST',
      path: '/api/setup/host/install/preview',
      body: { operationId },
    }),
  finishInstallRecovery: (body: InstallFinishInput) =>
    callSetupApi<InstallFinishResult>({
      method: 'POST',
      path: '/api/setup/host/install/finish',
      body,
    }),
  inspectRestrictedNetwork,
  prepareRestrictedNetwork,
  applyRestrictedNetwork,
  removeRestrictedNetwork,
  fetchSetupPlan,
  applySetupPlan,
  getComposeStatus,
  getComposeLogs,
  runComposeAction,
  rebuildHost: () =>
    callSetupApi<ComposeActionResult>({ method: 'POST', path: '/api/setup/host/rebuild' }),
  createPfbackup,
  savePfbackup,
  selectPfbackupForRestore,
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

contextBridge.exposeInMainWorld('praxisManagerBridge', api);
