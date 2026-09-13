/** Re-exports Setup Host API DTOs from shared package + Manager-only IPC types. */

import type { TlsLocalCheck, TlsStatus } from '@praxis-flow/server-shared/setup-api';

export type {
  ApplySetupInput,
  ApplySetupOptions,
  ApplySetupResult,
  ComposeAction,
  ComposeActionResult,
  ComposeLogsResult,
  ComposePublishedBinding,
  ComposeServiceStatus,
  ComposeStatus,
  DeliveryImagesStatus,
  DeviceUrls,
  DockerStatus,
  PfbackupInfo,
  PfbackupResult,
  PfbackupValidateResult,
  PfbackupInspectResult,
  PfbackupTlsInspectSummary,
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
  TlsActionResult,
  TlsCertificateStatus,
  TlsCustomCertificateInput,
  TlsDnsCheck,
  TlsErrorClass,
  TlsLocalCheck,
  TlsMode,
  TlsOperatorRequest,
  TlsPrepareInput,
  TlsPrepareResult,
  TlsRenewInput,
  TlsState,
  TlsStatus,
  TlsVerifyDnsResult,
  ResetStaffPinsResult,
  SetupPlan,
  SetupPlanInput,
  SetupProbesResult,
  StorageFolderPaths,
  StorageFoldersInput,
  StorageFoldersResult,
  SandboxScannerStatus,
} from '@praxis-flow/server-shared/setup-api';

/** Electron IPC: save `.pfbackup` via native save dialog. */
export type SavePfbackupResult = {
  saved: boolean;
  canceled: boolean;
  filePath: string | null;
};

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

/** Electron IPC: PEM is read in main and posted to Setup. Renderer never sees the bytes. */
export type TlsPemSetupResult =
  | { canceled: true }
  | { canceled: false; tls: TlsStatus; checks?: TlsLocalCheck[] };
