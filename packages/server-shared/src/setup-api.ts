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

export type EnvBackupResult = {
  envPath: string;
  backupPath: string;
};

export type EnvBackupInfo = {
  envPath: string;
  latestBackupPath: string | null;
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
  gateway: GatewayPlanInput;
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
  defaultGatewayBridgeUrl: string;
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
  network: HostNetworkStatus;
  gateway: HostGatewayStatus | null;
  deviceUrls: DeviceUrls | null;
  probes: ProbeResult[];
  compose: ComposeStatus | null;
  sandboxScanner: SandboxScannerStatus | null;
  networkBindings: NetworkBindingCheck[];
  deliveryImages: DeliveryImagesStatus;
};

/** Pollable stack/runtime snapshot — separate from config fields on `HostStatus`. */
export type HostRuntimeHealth = {
  checkedAt: string;
  envExists: boolean;
  configuredLanIp: string | null;
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
  gateway?: GatewayPlanInput;
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
  delivery?: boolean;
  folders?: StorageFolderPaths;
};
