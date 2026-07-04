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
  loadDeliveryImages(body: { archivePath: string; restartCompose?: boolean }): Promise<LoadDeliveryImagesResult>;
};

export type PraxisManagerMaintenanceApi = {
  getComposeStatus(): Promise<ComposeStatus>;
  getComposeLogs(service?: string, tail?: number): Promise<ComposeLogsResult>;
  runComposeAction(action: 'start' | 'stop' | 'restart', build?: boolean): Promise<ComposeActionResult>;
  backupEnv(): Promise<EnvBackupResult>;
  saveEnvBackup(backupPath: string): Promise<SaveEnvBackupResult>;
  saveStorageFolders(body: StorageFoldersInput): Promise<StorageFoldersResult>;
  saveHostNetwork(body: HostNetworkInput): Promise<HostNetworkResult>;
  getEnvBackupInfo(): Promise<EnvBackupInfo>;
  resetStaffPins(): Promise<ResetStaffPinsResult>;
};

export type PraxisManagerApi = PraxisManagerSetupApi &
  PraxisManagerMaintenanceApi & {
    /** Host OS where the Manager runs (`process.platform` from main). */
    hostPlatform: string;
  };
