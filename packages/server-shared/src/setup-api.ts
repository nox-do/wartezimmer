/** Shared Setup Host API DTOs — contract for `setup serve` and Praxis Flow Manager. */

import type { SandboxScannerStatus } from './sandbox-scanner.js';

export const SETUP_DEFAULT_PRACTICE_NAME = 'Hausarztpraxis';
export const SETUP_DEFAULT_GATEWAY_INTERFACE = 'eth1';
export const SETUP_DEFAULT_GATEWAY_IP = '192.168.88.1';

export type GatewayPlanInput = {
  enabled?: boolean;
  gatewayInterface?: string;
  gatewayIp?: string;
  portalAppIp?: string;
  authBridgeUrl?: string;
};

export type GatewayPlan = {
  enabled: boolean;
  gatewayInterface: string;
  gatewayIp: string;
  portalAppIp: string;
  authBridgeUrl: string;
};

/** Optional wire input for plan/apply/network — absent means leave PROXY_* env unchanged. */
export type ProxyConfigInput = {
  enabled: boolean;
  /** Defaults to 80 when enabled. */
  httpPort?: number;
};

export type DockerStatus = {
  installed: boolean;
  daemonRunning: boolean;
  composeAvailable: boolean;
  detail: string | null;
};

export type ProbeResult = {
  id: string;
  ok: boolean;
  message: string;
  detail?: string;
};

export type ComposeServiceStatus = {
  name: string;
  service: string;
  state: string;
  health: string | null;
  /** Host ports published by this container (from compose ps Publishers). */
  publishedPorts?: number[];
};

export type ComposeStatus = {
  running: boolean;
  services: ComposeServiceStatus[];
};

export type ComposeAction = 'start' | 'stop' | 'restart';

export type ComposeActionResult = {
  ok: boolean;
  log: string;
  compose: ComposeStatus;
};

export type ComposeLogsResult = {
  ok: boolean;
  log: string;
};

export type PfbackupResult = {
  envPath: string;
  backupPath: string;
};

export type PfbackupInfo = {
  envPath: string;
  latestBackupPath: string | null;
};

export type PfbackupValidateInput = {
  content: string;
};

export type PfbackupValidateResult = {
  archiveValid: boolean;
  restoreValid: boolean;
  archiveErrors: string[];
  restoreErrors: string[];
  summary?: {
    createdAt: string;
    settingsFormatVersion: number;
    exportedAt: string | null;
    releaseVersion: string | null;
    routingMode: string | null;
  };
};

export type PfbackupInspectInput = {
  content: string;
};

export type PfbackupInspectBackupSummary = {
  createdAt: string;
  settingsFormatVersion: number;
  releaseVersion: string | null;
  routingMode: string | null;
  portalEnabled: boolean;
  providerCredentialsIncluded: boolean;
};

export type PfbackupInspectEnvironment = {
  hostPaths: Record<string, string>;
  network: Record<string, string>;
  imageReferences: Record<string, string>;
};

export type PfbackupInspectCompatibility = {
  archiveValid: boolean;
  settingsValid: boolean;
  targetAppReachable: boolean;
  restoreSupported: boolean;
  warnings: string[];
};

export type PfbackupInspectResult = {
  ok: boolean;
  backup?: PfbackupInspectBackupSummary;
  environment?: PfbackupInspectEnvironment;
  compatibility: PfbackupInspectCompatibility;
  errors?: string[];
};

export type PfbackupRestoreInput = {
  content: string;
  skipProviderCredentials?: boolean;
};

export type PfbackupRestoreReport = {
  restoreId: string;
  routingMode: string | null;
  portalEnabled: boolean;
  providerCredentialsSkipped: boolean;
  disabledProviderIds: string[];
  compose: ComposeStatus;
};

export type PfbackupRestoreResult =
  | { ok: true; restoreId: string; report: PfbackupRestoreReport }
  | {
      ok: false;
      restoreId: string;
      failedPhase: string;
      rollbackAttempted: boolean;
      rollbackSucceeded: boolean;
      errors: string[];
    };

export type StorageFolderPaths = {
  imports: string;
  exports: string;
};

export type StorageFoldersInput = {
  importsHostPath: string;
  exportsHostPath: string;
  restartCompose?: boolean;
};

export type StorageFoldersResult = {
  envPath: string;
  backupPath: string | null;
  folders: StorageFolderPaths;
  created: string[];
  composeRestarted: boolean;
  stackWasRunning: boolean;
  compose: ComposeStatus | null;
  restartLog: string | null;
};

export type HostNetworkInput = {
  lanAppIp: string;
  restartCompose?: boolean;
  /** Optional product base override (http(s) origin). When omitted, setup derives from LAN plan. */
  canonicalBaseUrl?: string;
  gateway: GatewayPlanInput;
  /** When omitted, existing PROXY_* / APP_BIND_ADDRESS keys stay unchanged. */
  proxy?: ProxyConfigInput;
};

export type HostNetworkResult = {
  envPath: string;
  backupPath: string | null;
  keysWritten: string[];
  deviceUrls: DeviceUrls;
  gatewayComposeSkipped: boolean;
  composeRestarted: boolean;
  stackWasRunning: boolean;
  compose: ComposeStatus | null;
  restartLog: string | null;
};

export type ResetStaffPinsResult = {
  ok: boolean;
  log: string;
  defaultPin: string;
  databaseUpdated: boolean;
  compose: ComposeStatus;
};

export type RoutingMode = 'simple' | 'complex';

export type RoutingModeCapabilities = {
  routingMode: RoutingMode;
  /** Offene Wartenummern (nicht-terminale Visits). */
  openVisitCount: number;
  features: {
    complexRouting: boolean;
    journeyDesigner: boolean;
    routingSimulator: boolean;
    complexRoutingLicensed: boolean;
  };
};

export type SetRoutingModeInput = {
  routingMode: RoutingMode;
};

export type SetRoutingModeResult =
  | {
      ok: true;
      routingMode: RoutingMode;
      features: RoutingModeCapabilities['features'];
    }
  | {
      ok: false;
      code?: string;
      error: string;
      details?: Record<string, unknown>;
    };

export type SetupProbesResult = {
  probes: ProbeResult[];
};

export type LanCandidate = {
  address: string;
  interfaceName: string;
};

export type NetworkBindingCheck = {
  id: string;
  ok: boolean;
  message: string;
  detail?: string;
};

export type HostGatewayStatus = {
  enabled: boolean;
  gatewayInterface: string;
  gatewayIp: string;
  portalAppIp: string | null;
  authBridgeUrl: string | null;
};

/** P2a: HTTP proxy only. TLS modes are additive later. */
export type ProxyMode = 'off' | 'http';

export type ProxyStatus = {
  enabled: boolean;
  mode: ProxyMode;
  canonicalBaseUrl: string | null;
  httpPort: number;
  appBindAddress: string;
  /** Present when compose knows a `proxy` service (running or stopped); null if missing. */
  container: ComposeServiceStatus | null;
};

export type HostNetworkStatus = {
  configuredLanIp: string | null;
  currentLanCandidates: LanCandidate[];
  lanIpStale: boolean;
};

export type DeviceUrls = {
  appBaseUrl: string;
  terminal: string;
  mfa: string;
  tv: string;
  ops: string;
  opsSetup: string;
  portal: string;
};

export type DeliveryImagesStatus = {
  required: boolean;
  configured: boolean;
  appImage: string | null;
  sandboxImage: string | null;
  releaseVersion: string | null;
  archiveSha256: string | null;
  appPresent: boolean;
  sandboxPresent: boolean;
  ready: boolean;
};

export type LoadDeliveryImagesResult = {
  envPath: string;
  backupPath: string | null;
  loadedImages: string[];
  appImage: string;
  sandboxImage: string;
  deliveryImages: DeliveryImagesStatus;
  sha256Verified: boolean;
  sha256: string;
  releaseVersion: string | null;
  sha256Source: 'manifest.json' | 'SHA256SUMS.txt';
  composeRestarted: boolean;
  compose: ComposeStatus | null;
  restartLog: string | null;
};

export type PfupdateApplyInput = {
  archivePath: string;
  managerVersion?: string | null;
  settingsFormatVersion?: number | null;
};

export type PfupdateInspectPackageSummary = {
  releaseVersion: string;
  minimumManagerVersion: string;
  supportedSettingsFormatVersions: number[];
  targetSchemaVersion: number;
  images: {
    app: string;
    sandbox: string;
    gateway: string;
  };
};

export type PfupdateInspectCompatibility = {
  packageValid: boolean;
  managerCompatible: boolean;
  settingsCompatible: boolean;
  updateSupported: boolean;
  warnings: string[];
};

export type PfupdateInspectInput = {
  archivePath: string;
  managerVersion?: string | null;
  settingsFormatVersion?: number | null;
};

export type PfupdateInspectResult = {
  ok: boolean;
  package?: PfupdateInspectPackageSummary;
  currentReleaseVersion: string | null;
  compatibility: PfupdateInspectCompatibility;
  errors?: string[];
};

export type PfupdateApplyReport = {
  previousVersion: string | null;
  targetVersion: string;
  backupPath: string;
  compose: ComposeStatus;
};

export type PfupdateApplyResult =
  | { ok: true; updateId: string; report: PfupdateApplyReport }
  | {
      ok: false;
      updateId: string;
      failedPhase: string;
      rollbackAttempted: boolean;
      rollbackSucceeded: boolean;
      errors: string[];
    };

export type NetworkAddress = {
  family: string;
  address: string;
  internal: boolean;
  cidr?: string;
};

export type NetworkInterfaceInfo = {
  name: string;
  addresses: NetworkAddress[];
};

export type NetworkSnapshot = {
  interfaces: NetworkInterfaceInfo[];
  lanCandidates: Array<{
    label: string;
    address: string;
    interfaceName: string;
  }>;
  /** Host machine hostname (comfort path for LAN reachability). */
  machineHostname: string;
  gatewayComposeSupported: boolean;
};

export type HostStatus = {
  installHome: string;
  mode: string;
  composeProjectName: string;
  projectRoot: string;
  envExists: boolean;
  envPath: string;
  practiceDisplayName: string | null;
  docker: DockerStatus;
  folders: StorageFolderPaths;
  appBaseUrl: string;
  /** Raw CANONICAL_BASE_URL from .env when valid http(s) origin; null if unset/invalid. */
  configuredCanonicalBaseUrl: string | null;
  network: HostNetworkStatus;
  gateway: HostGatewayStatus | null;
  /** Always set: proxy is part of the host model; `enabled: false` / `mode: 'off'` is normal. */
  proxy: ProxyStatus;
  deviceUrls: DeviceUrls | null;
  probes: ProbeResult[];
  compose: ComposeStatus | null;
  sandboxScanner: SandboxScannerStatus | null;
  networkBindings: NetworkBindingCheck[];
  /**
   * Preflight before compose up: required host ports free (or already used by our stack).
   * Examples: app publish 8080, proxy 80/443, gateway bridge 9100 when enabled.
   */
  networkPrerequisites: NetworkBindingCheck[];
  deliveryImages: DeliveryImagesStatus;
  /** Live settings schema from maintenance app when reachable; otherwise current build default. */
  settingsFormatVersion: number;
};

/** Pollable stack/runtime snapshot — separate from config fields on `HostStatus`. */
export type HostRuntimeHealth = {
  checkedAt: string;
  envExists: boolean;
  configuredLanIp: string | null;
  /** Effective product base used for LAN probes (canonical or IP fallback). */
  appBaseUrl: string | null;
  docker: DockerStatus;
  compose: ComposeStatus | null;
  probes: ProbeResult[];
  sandboxScanner: SandboxScannerStatus | null;
};

export type HostStatusOptions = {
  includeProbes?: boolean;
  includeSandboxScanner?: boolean;
};

export type SetupPlan = {
  deviceUrls: DeviceUrls;
  gatewayEnv: Record<string, string>;
  secretsPreview: { keys: string[] };
};

/** Wire body for POST /api/setup/host/plan and /apply (server normalizes gateway defaults). */
export type SetupPlanInput = {
  lanAppIp: string;
  practiceDisplayName: string;
  /** Optional product base override (http(s) origin). When omitted, setup derives from LAN plan. */
  canonicalBaseUrl?: string;
  gateway?: GatewayPlanInput;
  /** When omitted, existing PROXY_* / APP_BIND_ADDRESS keys stay unchanged. */
  proxy?: ProxyConfigInput;
};

export type ApplySetupOptions = {
  runCompose?: boolean;
  preserveEnv?: boolean;
  delivery?: boolean;
  composeBuild?: boolean;
  runProbes?: boolean;
};

export type ApplySetupInput = SetupPlanInput &
  ApplySetupOptions & {
    folders?: StorageFolderPaths;
  };

export type ApplySetupResult = {
  envPath: string;
  backupPath: string | null;
  keysWritten: string[];
  folders: StorageFolderPaths;
  secretsGenerated: string[];
  secretsKept: string[];
  deviceUrls: DeviceUrls;
  compose: { ok: boolean; detail?: string } | null;
  gatewayComposeSkipped: boolean;
  probes: ProbeResult[];
};

/** Normalized plan input used by setup core after request parsing. */
export type NormalizedSetupPlanInput = {
  lanAppIp: string;
  practiceDisplayName: string;
  gateway: GatewayPlan;
  portalAppIp?: string;
  canonicalBaseUrl?: string;
  delivery?: boolean;
  folders?: StorageFolderPaths;
  /** Present only when the wire body included `proxy`. */
  proxy?: ProxyConfigInput;
};
