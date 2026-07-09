import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import {
  draftCanonicalBaseUrl,
  inferReachabilityFields,
  isHttpOrigin,
  lanProbeBaseUrl,
  matchesHostnameModeBase,
} from './reachability.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/praxis',
    mode: 'dev',
    composeProjectName: 'pf-praxis',
    projectRoot: '/tmp/praxis',
    envExists: true,
    envPath: '/tmp/praxis/.env',
    practiceDisplayName: 'Praxis',
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/imports', exports: '/exports' },
    appBaseUrl: 'http://192.168.1.10:8080',
    configuredCanonicalBaseUrl: null,
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
    gateway: null,
    deviceUrls: {
      appBaseUrl: 'http://192.168.1.10:8080',
      terminal: 'http://192.168.1.10:8080/terminal',
      mfa: 'http://192.168.1.10:8080/mfa',
      tv: 'http://192.168.1.10:8080/tv',
      ops: 'http://192.168.1.10:8080/ops',
      opsSetup: 'http://192.168.1.10:8080/ops/setup',
      portal: 'http://192.168.1.10:8080/portal',
    },
    probes: [],
    compose: null,
    sandboxScanner: null,
    networkBindings: [],
    networkPrerequisites: [{ id: 'preflight.app-port', ok: true, message: 'Port 8080 ist frei' }],
    deliveryImages: {
      required: false,
      configured: false,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: false,
      sandboxPresent: false,
      ready: true,
    },
    ...overrides,
  };
}

test('isHttpOrigin rejects path query hash and credentials', () => {
  assert.equal(isHttpOrigin('http://praxis.local:8080'), true);
  assert.equal(isHttpOrigin('http://praxis.local/base'), false);
  assert.equal(isHttpOrigin('http://praxis.local?x'), false);
});

test('inferReachabilityFields uses lan-ip for exact IP fallback', () => {
  const fields = inferReachabilityFields(
    minimalStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' }),
  );
  assert.equal(fields.reachabilityMode, 'lan-ip');
});

test('inferReachabilityFields uses custom for hostname bases', () => {
  const fields = inferReachabilityFields(
    minimalStatus({ configuredCanonicalBaseUrl: 'http://praxis-flow.local:8080' }),
  );
  assert.equal(fields.reachabilityMode, 'custom');
  assert.equal(fields.customHostname, 'praxis-flow.local');
});

test('draftCanonicalBaseUrl builds hostname mode from network snapshot', () => {
  assert.equal(
    draftCanonicalBaseUrl(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        reachabilityMode: 'hostname',
        customHostname: '',
      },
      { machineHostname: 'praxis-mac' },
    ),
    'http://praxis-mac:8080',
  );
});

test('draftCanonicalBaseUrl builds custom mode from hostname only', () => {
  assert.equal(
    draftCanonicalBaseUrl(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        reachabilityMode: 'custom',
        customHostname: 'praxis-flow.local',
      },
      null,
    ),
    'http://praxis-flow.local:8080',
  );
  assert.equal(
    draftCanonicalBaseUrl(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        reachabilityMode: 'custom',
        customHostname: 'http://praxis-flow.local:9000',
      },
      null,
    ),
    'http://praxis-flow.local:8080',
  );
});

test('normalizeCustomHostname strips scheme and port', async () => {
  const { normalizeCustomHostname } = await import('./reachability.js');
  assert.equal(normalizeCustomHostname('praxis-flow.local'), 'praxis-flow.local');
  assert.equal(normalizeCustomHostname('http://praxis-flow.local:8080/'), 'praxis-flow.local');
  assert.equal(normalizeCustomHostname('https://praxis.example.de'), 'praxis.example.de');
  assert.equal(normalizeCustomHostname('http://praxis.local/base'), '');
});

test('matchesHostnameModeBase requires exact http://host:8080 form', () => {
  assert.equal(matchesHostnameModeBase('http://praxis-mac:8080', 'praxis-mac'), true);
  assert.equal(matchesHostnameModeBase('https://praxis-mac', 'praxis-mac'), false);
  assert.equal(matchesHostnameModeBase('http://praxis-mac:9000', 'praxis-mac'), false);
  assert.equal(matchesHostnameModeBase('http://praxis-mac', 'praxis-mac'), false);
});

test('lanProbeBaseUrl ignores local-only appBaseUrl fallback', () => {
  assert.equal(
    lanProbeBaseUrl({
      network: { configuredLanIp: null, currentLanCandidates: [], lanIpStale: false },
      configuredCanonicalBaseUrl: null,
      deviceUrls: null,
    }),
    undefined,
  );
  assert.equal(
    lanProbeBaseUrl({
      network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
      configuredCanonicalBaseUrl: null,
      deviceUrls: null,
    }),
    'http://192.168.1.10:8080',
  );
});
