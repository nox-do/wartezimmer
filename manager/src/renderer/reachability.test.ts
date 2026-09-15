import assert from 'node:assert/strict';
import test from 'node:test';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { draftCanonicalBaseUrl, existingHttpHostname, lanProbeBaseUrl } from './reachability.js';

for (const proxyEnabled of [false, true]) {
  test(`HTTP preview uses selected IP or persisted hostname with proxy ${proxyEnabled}`, () => {
    const fields = { lanAppIp: '192.168.1.25', customLanIp: '', proxyEnabled };
    const suffix = proxyEnabled ? '' : ':8080';
    assert.equal(draftCanonicalBaseUrl(fields, null), `http://192.168.1.25${suffix}`);
    for (const old of ['http://192.168.1.10:8080', 'http://127.0.0.1:8080', 'http://[::1]:8080']) {
      assert.equal(
        draftCanonicalBaseUrl(fields, minimalHostStatus({ configuredCanonicalBaseUrl: old })),
        `http://192.168.1.25${suffix}`,
      );
    }
    assert.equal(
      draftCanonicalBaseUrl(
        fields,
        minimalHostStatus({ configuredCanonicalBaseUrl: 'http://practice.local:8080' }),
      ),
      `http://practice.local${suffix}`,
    );
  });
}

test('TLS preview preserves the saved identity while changing the selected IP', () => {
  const status = minimalHostStatus({ configuredCanonicalBaseUrl: 'https://staff.example.test' });
  status.tls = {
    state: 'active',
    mode: 'managed',
    hostname: 'staff.example.test',
    installationId: 'example',
    tokenConsumed: true,
    applyReady: true,
    cutoverApplied: true,
    certificate: null,
    lastError: null,
    acmeCnameTarget: null,
  };
  assert.equal(existingHttpHostname(status), null);
  assert.equal(
    draftCanonicalBaseUrl(
      { lanAppIp: '192.168.1.25', customLanIp: '', proxyEnabled: true },
      status,
    ),
    'https://staff.example.test',
  );
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
