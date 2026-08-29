/** Shared Setup Host API DTOs — contract for `setup serve` and Praxis Flow Manager. */

import type { SandboxScannerStatus } from './sandbox-scanner.js';

export type { SandboxScannerStatus } from './sandbox-scanner.js';

export const SETUP_TLS_ROUTES = {
  prepare: '/api/setup/host/tls/prepare',
  verifyDns: '/api/setup/host/tls/verify-dns',
  obtainCertificate: '/api/setup/host/tls/obtain-certificate',
  customCertificate: '/api/setup/host/tls/custom-certificate',
  checkCertificate: '/api/setup/host/tls/check-certificate',
  apply: '/api/setup/host/tls/apply',
  repair: '/api/setup/host/tls/repair',
  reset: '/api/setup/host/tls/reset',
  renew: '/api/setup/host/tls/renew',
} as const;

/** PoC operator zone (product later: lan.praxis-flow.de). */
export const TLS_OPERATOR_ZONE_DEFAULT = 'lan.notaus.de';
export const TLS_OPERATOR_MAIL = 'cert@notaus.de';

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
  tlsSidecarPath?: string | null;
};

export type PfbackupInfo = {
  envPath: string;
  latestBackupPath: string | null;
  latestTlsSidecarPath?: string | null;
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
  /** Future LAN-TLS sidecar bytes encoded for JSON transport; never a host path. */
  tlsSidecarBase64?: string;
};

/** Optional LAN-TLS inspect data; absent for today's HTTP-only backups. */
export type PfbackupTlsInspectSummary = {
  state: TlsState;
  inBackup: boolean;
  preparedInBackup: boolean;
  sidecarPresent: boolean;
  sidecarMatches: boolean;
  metadataConsistent: boolean;
};

export type PfbackupInspectBackupSummary = {
  createdAt: string;
  settingsFormatVersion: number;
  releaseVersion: string | null;
  routingMode: string | null;
  portalEnabled: boolean;
  providerCredentialsIncluded: boolean;
  tls?: PfbackupTlsInspectSummary;
};

export type PfbackupInspectEnvironment = {
  hostPaths: Record<string, string>;
  network: Record<string, string>;
  imageReferences: Record<string, string>;
};

/**
 * LAN-TLS later adds the optional backup.tls summary. Its restore gate is
 * additional: archiveValid, settingsValid and targetAppReachable stay mandatory.
 * Copy/helpers: docs/mocks/lan-tls-wizard/tls-model.js
 */
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
  /** Future LAN-TLS sidecar bytes encoded for JSON transport; never a host path. */
  tlsSidecarBase64?: string;
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
  /**
   * Re-ensure proxy image + compose up while PROXY stays enabled (recovery when
   * container/image is missing). Implies restartCompose semantics for compose.
   */
  repairProxy?: boolean;
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
  mac?: string;
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

/** Proxy runtime mode. TLS modes are only written by `POST /host/tls/apply`. */
export type ProxyMode = 'off' | 'http' | 'tls-managed' | 'tls-custom';

export type ProxyStatus = {
  enabled: boolean;
  mode: ProxyMode;
  canonicalBaseUrl: string | null;
  httpPort: number;
  appBindAddress: string;
  /** Present when compose knows a `proxy` service (running or stopped); null if missing. */
  container: ComposeServiceStatus | null;
};

/** LAN-TLS contract anchor. Setup remains the only authority for these values. */
export type TlsState =
  | 'off'
  | 'preparing'
  | 'awaiting-operator-dns'
  | 'dns-verified'
  | 'obtaining-certificate'
  | 'active'
  | 'degraded'
  | 'error';

export type TlsMode = 'managed' | 'custom';

export type TlsCertificateStatus = {
  issuer: string;
  notBefore: string;
  notAfter: string;
  names: string[];
};

export type TlsErrorClass =
  | 'a-record'
  | 'collision'
  | 'dns-filter'
  | 'isolation'
  | 'firewall'
  | 'port-443'
  | 'clock'
  | 'acme'
  | 'cert-name';

export type TlsStatus = {
  state: TlsState;
  mode: TlsMode | null;
  hostname: string | null;
  installationId: string | null;
  tokenConsumed: boolean;
  /** Authoritative local-check gate while state remains `dns-verified`. */
  applyReady: boolean;
  /** Distinguishes pre/post-cutover `error` without consulting PROXY_MODE. */
  cutoverApplied: boolean;
  certificate: TlsCertificateStatus | null;
  lastError: { class: TlsErrorClass; message: string } | null;
  /** Public ACME-DNS fulldomain for mail replay. Not a secret. */
  acmeCnameTarget: string | null;
};

export type TlsPrepareInput = {
  mode: TlsMode;
  /** Fixed DNS name. Managed setup may omit it to use the installation-ID label. */
  hostname?: string;
  /** Confirmed, stable LAN IPv4 address which the public A record must contain. */
  lanIp: string;
};

export type TlsOperatorRequest = {
  installationId: string;
  /** Returned by prepare, never by status. Removed from disk after consumption/reset. */
  oneTimeToken: string;
  aRecord: { name: string; value: string };
  acmeCname: { name: string; value: string };
};

export type TlsPrepareResult = {
  tls: TlsStatus;
  /** Managed path only. Custom TLS has no operator token or ACME delegation. */
  operatorRequest: TlsOperatorRequest | null;
};

export type TlsDnsCheck = {
  id: 'server-ipv4' | 'a-record' | 'acme-cname';
  ok: boolean;
  message: string;
  detail?: string;
};

export type TlsVerifyDnsResult = {
  tls: TlsStatus;
  checks: TlsDnsCheck[];
};

export type TlsCustomCertificateInput = {
  /** PEM certificate followed by optional intermediate certificates. */
  fullchainPem: string;
  /** Unencrypted PEM private key. Never persisted in `.env` or returned. */
  privateKeyPem: string;
};

export type TlsLocalCheck = {
  id: 'certificate' | 'tcp-443' | 'http2' | 'sse';
  ok: boolean;
  message: string;
  detail?: string;
};

export type TlsActionResult = {
  tls: TlsStatus;
  checks?: TlsLocalCheck[];
};

/** Custom renew reuses the staging payload; managed renew has an empty body. */
export type TlsRenewInput = Partial<TlsCustomCertificateInput>;

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
    gateway?: string;
    proxy?: string;
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
  mac?: string;
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
    mac?: string;
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
  /** Present on current Setup hosts; optional only for backward compatibility with older hosts. */
  tls?: TlsStatus;
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
  /**
   * Header tile for Proxy-Server — only when the offline image is present and
   * the proxy has been used (enabled and/or container exists).
   */
  proxyServer: {
    enabled: boolean;
    container: ComposeServiceStatus | null;
  } | null;
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
  /** Optional seed for PRACTICE_DISPLAY_NAME; practice truth lives in Ops DB. */
  practiceDisplayName?: string;
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
