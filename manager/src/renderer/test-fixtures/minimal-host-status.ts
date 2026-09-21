import type { HostLifecycle } from '@praxis-flow/server-shared';
import type { HostStatus } from '../../shared/host-status.js';

const CONFIGURED_GATEWAY = {
  enabled: true,
  gatewayInterface: 'eth1',
  gatewayIp: '192.168.88.1',
  portalAppIp: '192.168.1.10',
  authBridgeUrl: 'http://10.0.0.2:9100',
} as const;

export function knownLifecycle(
  mode: HostLifecycle['mode'] = 'direct-http',
  preparation: HostLifecycle['preparation'] = 'none',
): HostLifecycle {
  return {
    assessment: 'known',
    mode,
    preparation,
    operation: 'none',
    recovery: 'none',
    issues: [],
  };
}

/** Shared HostStatus defaults for renderer unit tests (configured / maintenance host). */
export function minimalHostStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installation: { kind: 'healthy', updateEligible: true },
    installHome: '/tmp/pf',
    mode: 'install',
    composeProjectName: 'pf-test',
    projectRoot: '/tmp/pf',
    envExists: true,
    envPath: '/tmp/pf/.env',
    practiceDisplayName: 'Test',
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/tmp/imports', exports: '/tmp/exports' },
    appBaseUrl: 'http://192.168.1.10:8080',
    configuredCanonicalBaseUrl: null,
    network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
    restrictedNetwork: {
      phase: 'unconfigured',
      health: 'not-configured',
      binding: null,
      exposedSurfaces: ['patient-portal'],
      portalHostname: null,
      lastError: null,
    },
    gateway: null,
    proxy: {
      enabled: false,
      mode: 'off',
      canonicalBaseUrl: 'http://192.168.1.10:8080',
      httpPort: 80,
      appBindAddress: '0.0.0.0',
      container: null,
    },
    deviceUrls: null,
    probes: [],
    compose: { running: true, services: [] },
    sandboxScanner: null,
    networkBindings: [],
    networkPrerequisites: [],
    deliveryImages: {
      required: false,
      configured: true,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: true,
      sandboxPresent: true,
      ready: true,
    },
    settingsFormatVersion: 1,
    ...overrides,
  };
}

/** Host before first setup: no .env, no LAN, release package still required. */
export function freshInstallHostStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return minimalHostStatus({
    lifecycle: knownLifecycle('uninstalled'),
    installation: { kind: 'fresh' },
    mode: 'dev',
    envExists: false,
    practiceDisplayName: null,
    appBaseUrl: 'http://127.0.0.1:8080',
    configuredCanonicalBaseUrl: null,
    network: { configuredLanIp: null, currentLanCandidates: [], lanIpStale: false },
    gateway: null,
    deliveryImages: {
      required: true,
      configured: false,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: false,
      sandboxPresent: false,
      ready: false,
    },
    ...overrides,
  });
}

export { CONFIGURED_GATEWAY };
