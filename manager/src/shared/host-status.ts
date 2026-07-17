/** Re-exports Setup Host API DTOs from shared package + Manager-only IPC types. */

export type {
  ApplySetupInput,
  ApplySetupOptions,
  ApplySetupResult,
  ComposeAction,
  ComposeActionResult,
  ComposeLogsResult,
  ComposeServiceStatus,
  ComposeStatus,
  DeliveryImagesStatus,
  DeviceUrls,
  DockerStatus,
  PfbackupInfo,
  PfbackupResult,
  PfbackupValidateResult,
  PfbackupInspectResult,
  PfbackupRestoreResult,
  GatewayPlan,
  GatewayPlanInput,
  HostGatewayStatus,
  HostNetworkInput,
  HostNetworkResult,
  HostNetworkStatus,
  HostRuntimeHealth,
  HostStatus,
  LanCandidate,
  LoadDeliveryImagesResult,
  PfupdateApplyInput,
  PfupdateApplyResult,
  PfupdateInspectInput,
  PfupdateInspectResult,
  NetworkBindingCheck,
  NetworkSnapshot,
  ProbeResult,
  ProxyConfigInput,
  ProxyMode,
  ProxyStatus,
  ResetStaffPinsResult,
  RoutingMode,
  RoutingModeCapabilities,
  SetRoutingModeInput,
  SetRoutingModeResult,
  SetupPlan,
  SetupPlanInput,
  SetupProbesResult,
  StorageFolderPaths,
  StorageFoldersInput,
  StorageFoldersResult,
} from '@praxis-flow/server-shared';

export type { SandboxScannerStatus } from '@praxis-flow/server-shared';

/** Electron IPC: save `.pfbackup` via native save dialog. */
export type SavePfbackupResult = {
  saved: boolean;
  canceled: boolean;
  filePath: string | null;
};

/** @deprecated Use SavePfbackupResult */
export type SaveEnvBackupResult = SavePfbackupResult;

/** Electron IPC: native folder picker. */
export type SelectFolderResult = {
  canceled: boolean;
  path: string | null;
};

/** Electron IPC: release archive file picker (Erstinstallation / Wizard). */
export type SelectReleaseArchiveResult = {
  canceled: boolean;
  path: string | null;
};

/** Electron IPC: update package file picker (Wartung). */
export type SelectPfupdateArchiveResult = {
  canceled: boolean;
  path: string | null;
};
