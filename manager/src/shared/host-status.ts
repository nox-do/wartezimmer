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
  EnvBackupInfo,
  EnvBackupResult,
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
  NetworkBindingCheck,
  NetworkSnapshot,
  ProbeResult,
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

/** Electron IPC: save `.env` backup via native save dialog. */
export type SaveEnvBackupResult = {
  saved: boolean;
  canceled: boolean;
  filePath: string | null;
};

/** Electron IPC: native folder picker. */
export type SelectFolderResult = {
  canceled: boolean;
  path: string | null;
};

/** Electron IPC: release archive file picker. */
export type SelectReleaseArchiveResult = {
  canceled: boolean;
  path: string | null;
};
