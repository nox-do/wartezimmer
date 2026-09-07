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
  PfupdateApplyInput,
  PfupdateApplyResult,
  PfupdateInspectInput,
  PfupdateInspectResult,
  SavePfbackupResult,
  LoadDeliveryImagesResult,
  SelectFolderResult,
  SelectReleaseArchiveResult,
  SelectPfupdateArchiveResult,
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
  TlsPemSetupResult,
  TlsPrepareInput,
  TlsPrepareResult,
  TlsVerifyDnsResult,
} from './host-status.js';

export type PraxisManagerSetupApi = {
  getSetupApiBase(): Promise<string>;
  fetchSetupStatus(options?: { includeProbes?: boolean }): Promise<HostStatus>;
  fetchRuntimeHealth(): Promise<HostRuntimeHealth>;
  fetchSetupNetwork(): Promise<NetworkSnapshot>;
  fetchSetupPlan(body: SetupPlanInput): Promise<SetupPlan>;
  applySetupPlan(body: ApplySetupInput): Promise<ApplySetupResult>;
  runSetupProbes(body: {
    localAppBaseUrl?: string;
    lanAppBaseUrl?: string;
  }): Promise<SetupProbesResult>;
  openExternalUrl(url: string): Promise<void>;
  selectFolder(defaultPath?: string): Promise<SelectFolderResult>;
  selectReleaseArchive(): Promise<SelectReleaseArchiveResult>;
  selectPfupdateArchive(): Promise<SelectPfupdateArchiveResult>;
  loadDeliveryImages(body: {
    archivePath: string;
    restartCompose?: boolean;
  }): Promise<LoadDeliveryImagesResult>;
  applyPfupdate(body: PfupdateApplyInput): Promise<PfupdateApplyResult>;
  inspectPfupdate(body: PfupdateInspectInput): Promise<PfupdateInspectResult>;
};

export type PraxisManagerMaintenanceApi = {
  getComposeStatus(): Promise<ComposeStatus>;
  getComposeLogs(service?: string, tail?: number): Promise<ComposeLogsResult>;
  runComposeAction(action: 'start' | 'stop' | 'restart'): Promise<ComposeActionResult>;
  createPfbackup(): Promise<PfbackupResult>;
  savePfbackup(backupPath: string): Promise<SavePfbackupResult>;
  validatePfbackup(content: string): Promise<PfbackupValidateResult>;
  inspectPfbackup(
    content: string,
    options?: { tlsSidecarBase64?: string },
  ): Promise<PfbackupInspectResult>;
  restorePfbackup(
    content: string,
    options?: { skipProviderCredentials?: boolean; tlsSidecarBase64?: string },
  ): Promise<PfbackupRestoreResult>;
  readPfbackupForValidate(): Promise<
    | { canceled: true }
    | { canceled: false; content: string; filePath: string; tlsSidecarBase64?: string | null }
  >;
  readTlsSidecar(): Promise<{ canceled: true } | { canceled: false; tlsSidecarBase64: string }>;
  saveTlsSidecar(backupPath: string): Promise<SavePfbackupResult>;
  inspectPfbackupFile(backupPath: string): Promise<PfbackupInspectResult>;
  saveStorageFolders(body: StorageFoldersInput): Promise<StorageFoldersResult>;
  saveHostNetwork(body: HostNetworkInput): Promise<HostNetworkResult>;
  prepareHostTls(body: TlsPrepareInput): Promise<TlsPrepareResult>;
  verifyHostTlsDns(): Promise<TlsVerifyDnsResult>;
  obtainHostTlsCertificate(): Promise<TlsActionResult>;
  stageHostTlsCertificate(): Promise<TlsPemSetupResult>;
  checkHostTlsCertificate(): Promise<TlsActionResult>;
  applyHostTls(): Promise<TlsActionResult>;
  repairHostTls(): Promise<TlsActionResult>;
  resetHostTls(): Promise<TlsActionResult>;
  renewHostTls(): Promise<TlsActionResult>;
  renewHostTlsFromPem(): Promise<TlsPemSetupResult>;
  getPfbackupInfo(): Promise<PfbackupInfo>;
  resetStaffPins(): Promise<ResetStaffPinsResult>;
};

export type PraxisManagerApi = PraxisManagerSetupApi &
  PraxisManagerMaintenanceApi & {
    /** Host OS where the Manager runs (`process.platform` from main). */
    hostPlatform: string;
  };
