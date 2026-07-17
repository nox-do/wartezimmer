import assert from 'node:assert/strict';
import test from 'node:test';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import {
  draftCanonicalBaseUrl,
  inferReachabilityFields,
  isHttpOrigin,
  lanProbeBaseUrl,
  matchesHostnameModeBase,
} from './reachability.js';

test('isHttpOrigin rejects path query hash and credentials', () => {
  assert.equal(isHttpOrigin('http://praxis.local:8080'), true);
  assert.equal(isHttpOrigin('http://praxis.local/base'), false);
  assert.equal(isHttpOrigin('http://praxis.local?x'), false);
});

test('inferReachabilityFields uses lan-ip for exact IP fallback', () => {
  const fields = inferReachabilityFields(
    minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' }),
  );
  assert.equal(fields.reachabilityMode, 'lan-ip');
  assert.equal(fields.proxyEnabled, false);
});

test('inferReachabilityFields uses lan-ip for proxy IP origin without port', () => {
  const fields = inferReachabilityFields(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10',
      proxy: {
        enabled: true,
        mode: 'http',
        canonicalBaseUrl: 'http://192.168.1.10',
        httpPort: 80,
        appBindAddress: '127.0.0.1',
        container: null,
      },
    }),
  );
  assert.equal(fields.reachabilityMode, 'lan-ip');
  assert.equal(fields.proxyEnabled, true);
});

test('inferReachabilityFields uses custom for hostname bases', () => {
  const fields = inferReachabilityFields(
    minimalHostStatus({ configuredCanonicalBaseUrl: 'http://praxis-flow.local:8080' }),
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
        proxyEnabled: false,
      },
      { machineHostname: 'praxis-mac' },
    ),
    'http://praxis-mac:8080',
  );
});

test('draftCanonicalBaseUrl omits port 80 when proxy is enabled', () => {
  assert.equal(
    draftCanonicalBaseUrl(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        reachabilityMode: 'lan-ip',
        customHostname: '',
        proxyEnabled: true,
      },
      null,
    ),
    'http://192.168.1.10',
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
        proxyEnabled: false,
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
        proxyEnabled: false,
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
  assert.equal(matchesHostnameModeBase('http://praxis-mac', 'praxis-mac', 80), true);
});

test('lanProbeBaseUrl ignores local-only appBaseUrl fallback', () => {
  assert.equal(
    lanProbeBaseUrl({
      network: { configuredLanIp: null, currentLanCandidates: [], lanIpStale: false },
      configuredCanonicalBaseUrl: null,
      deviceUrls: null,
      proxy: {
        enabled: false,
        mode: 'off',
        canonicalBaseUrl: null,
        httpPort: 80,
        appBindAddress: '0.0.0.0',
        container: null,
      },
    }),
    undefined,
  );
  assert.equal(
    lanProbeBaseUrl({
      network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
      configuredCanonicalBaseUrl: null,
      deviceUrls: null,
      proxy: {
        enabled: false,
        mode: 'off',
        canonicalBaseUrl: null,
        httpPort: 80,
        appBindAddress: '0.0.0.0',
        container: null,
      },
    }),
    'http://192.168.1.10:8080',
  );
});
