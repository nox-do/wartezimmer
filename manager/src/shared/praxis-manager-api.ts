import type {
  RecoveryBackupCandidate,
  InstallRecoveryPreview,
  InstallFinishInput,
  InstallFinishResult,
} from './host-status.js';
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
  TlsPemSetupResult,
  TlsPrepareInput,
  TlsPrepareResult,
  TlsVerifyDnsResult,
} from './host-status.js';

export type PraxisManagerSetupApi = {
  fetchSetupStatus(options?: { includeProbes?: boolean }): Promise<HostStatus>;
  fetchRuntimeHealth(): Promise<HostRuntimeHealth>;
  fetchSetupNetwork(): Promise<NetworkSnapshot>;
  startStoppedInstallation(): Promise<InstallationStartResult>;
  prepareInstall(body: InstallPrepareInput): Promise<InstallPrepareResult>;
  commitInstall(body: InstallCommitInput): Promise<InstallCommitResult>;
  discoverRecoveryBackups(): Promise<RecoveryBackupCandidate[]>;
  previewInstallRecovery(operationId: string): Promise<InstallRecoveryPreview>;
  finishInstallRecovery(input: InstallFinishInput): Promise<InstallFinishResult>;
  abortInstall(operationId: string): Promise<InstallAbortResult>;
  inspectRestrictedNetwork(): Promise<RestrictedNetworkInspectResult>;
  prepareRestrictedNetwork(
    body: RestrictedNetworkPrepareInput,
  ): Promise<RestrictedNetworkPrepareResult>;
  applyRestrictedNetwork(): Promise<RestrictedNetworkActionResult>;
  removeRestrictedNetwork(): Promise<RestrictedNetworkActionResult>;
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
  rebuildHost(): Promise<ComposeActionResult>;
  createPfbackup(): Promise<PfbackupResult>;
  savePfbackup(backupPath: string): Promise<SavePfbackupResult>;
  inspectPfbackup(content: string): Promise<PfbackupInspectResult>;
  restorePfbackup(
    content: string,
    options?: { skipProviderCredentials?: boolean },
  ): Promise<PfbackupRestoreResult>;
  selectPfbackupForRestore(): Promise<
    { canceled: true } | { canceled: false; content: string; filePath: string }
  >;
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
