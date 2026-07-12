import type {
  ApplySetupInput,
  ApplySetupResult,
  ComposeActionResult,
  ComposeLogsResult,
  ComposeStatus,
  EnvBackupInfo,
  EnvBackupResult,
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
  RoutingModeCapabilities,
  SetRoutingModeInput,
  SetRoutingModeResult,
  SetupPlan,
  SetupPlanInput,
  SetupProbesResult,
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
  runComposeAction(
    action: 'start' | 'stop' | 'restart',
    build?: boolean,
  ): Promise<ComposeActionResult>;
  createPfbackup(): Promise<PfbackupResult>;
  savePfbackup(backupPath: string): Promise<SavePfbackupResult>;
  validatePfbackup(content: string): Promise<PfbackupValidateResult>;
  inspectPfbackup(content: string): Promise<PfbackupInspectResult>;
  restorePfbackup(
    content: string,
    options?: { skipProviderCredentials?: boolean },
  ): Promise<PfbackupRestoreResult>;
  readPfbackupForValidate(): Promise<
    { canceled: true } | { canceled: false; content: string; filePath: string }
  >;
  saveStorageFolders(body: StorageFoldersInput): Promise<StorageFoldersResult>;
  saveHostNetwork(body: HostNetworkInput): Promise<HostNetworkResult>;
  getPfbackupInfo(): Promise<PfbackupInfo>;
  resetStaffPins(): Promise<ResetStaffPinsResult>;
  getRoutingMode(): Promise<RoutingModeCapabilities>;
  setRoutingMode(body: SetRoutingModeInput): Promise<SetRoutingModeResult>;
};

export type PraxisManagerApi = PraxisManagerSetupApi &
  PraxisManagerMaintenanceApi & {
    /** Host OS where the Manager runs (`process.platform` from main). */
    hostPlatform: string;
  };
