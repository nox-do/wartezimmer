import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeviceUrlsFromBaseUrl,
  buildGatewayEnv,
  fallbackCanonicalBaseUrl,
  nextCanonicalBaseUrlForLanChange,
  parseHttpBaseUrl,
  resolveCanonicalBaseUrl,
  resolveCanonicalBaseUrlForLanPlan,
} from './urls.js';

test('buildDeviceUrlsFromBaseUrl derives role URLs from a base', () => {
  assert.deepEqual(buildDeviceUrlsFromBaseUrl('http://192.168.1.13:8080'), {
    appBaseUrl: 'http://192.168.1.13:8080',
    terminal: 'http://192.168.1.13:8080/terminal',
    mfa: 'http://192.168.1.13:8080/mfa',
    tv: 'http://192.168.1.13:8080/tv',
    ops: 'http://192.168.1.13:8080/ops',
    opsSetup: 'http://192.168.1.13:8080/ops/setup',
    portal: 'http://192.168.1.13:8080/portal',
  });
});

test('buildDeviceUrlsFromBaseUrl strips trailing slashes', () => {
  assert.equal(
    buildDeviceUrlsFromBaseUrl('http://praxis-flow.local/').appBaseUrl,
    'http://praxis-flow.local',
  );
});

test('parseHttpBaseUrl accepts only http(s) origins', () => {
  assert.equal(parseHttpBaseUrl('http://praxis.local:8080/'), 'http://praxis.local:8080');
  assert.equal(parseHttpBaseUrl('https://praxis.example.de'), 'https://praxis.example.de');
  assert.equal(parseHttpBaseUrl('file:///tmp/x'), null);
  assert.equal(parseHttpBaseUrl('ftp://host'), null);
  assert.equal(parseHttpBaseUrl('not a url'), null);
  assert.equal(parseHttpBaseUrl('http://praxis.local?x'), null);
  assert.equal(parseHttpBaseUrl('http://praxis.local#x'), null);
  assert.equal(parseHttpBaseUrl('http://praxis.local/base'), null);
  assert.equal(parseHttpBaseUrl('http://user:pass@praxis.local:8080'), null);
});

test('resolveCanonicalBaseUrl falls back to LAN IP when env is empty', () => {
  assert.equal(resolveCanonicalBaseUrl(new Map(), '192.168.1.50'), 'http://192.168.1.50:8080');
  assert.equal(resolveCanonicalBaseUrl(null, null), null);
});

test('resolveCanonicalBaseUrl prefers CANONICAL_BASE_URL', () => {
  const env = new Map([['CANONICAL_BASE_URL', 'http://praxis-flow.local:8080/']]);
  assert.equal(resolveCanonicalBaseUrl(env, '192.168.1.50'), 'http://praxis-flow.local:8080');
});

test('resolveCanonicalBaseUrl ignores invalid or non-http CANONICAL_BASE_URL', () => {
  assert.equal(
    resolveCanonicalBaseUrl(new Map([['CANONICAL_BASE_URL', 'not a url']]), '10.0.0.5'),
    'http://10.0.0.5:8080',
  );
  assert.equal(
    resolveCanonicalBaseUrl(new Map([['CANONICAL_BASE_URL', 'file:///tmp/x']]), '10.0.0.5'),
    'http://10.0.0.5:8080',
  );
});

test('nextCanonicalBaseUrlForLanChange rewrites IP-derived bases', () => {
  assert.equal(
    nextCanonicalBaseUrlForLanChange({
      existingCanonical: 'http://192.168.1.10:8080',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    'http://192.168.1.20:8080',
  );
});

test('nextCanonicalBaseUrlForLanChange keeps custom hostnames', () => {
  assert.equal(
    nextCanonicalBaseUrlForLanChange({
      existingCanonical: 'http://praxis-flow.local:8080',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    null,
  );
});

test('nextCanonicalBaseUrlForLanChange keeps non-exact IP forms (TLS / other ports)', () => {
  assert.equal(
    nextCanonicalBaseUrlForLanChange({
      existingCanonical: 'https://192.168.1.10',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    null,
  );
  assert.equal(
    nextCanonicalBaseUrlForLanChange({
      existingCanonical: 'http://192.168.1.10',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    null,
  );
  assert.equal(
    nextCanonicalBaseUrlForLanChange({
      existingCanonical: 'http://192.168.1.10:9000',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    null,
  );
});

test('nextCanonicalBaseUrlForLanChange seeds missing canonical from next LAN IP', () => {
  assert.equal(
    nextCanonicalBaseUrlForLanChange({
      existingCanonical: null,
      previousLanIp: null,
      nextLanIp: '192.168.1.13',
    }),
    fallbackCanonicalBaseUrl('192.168.1.13'),
  );
});

test('resolveCanonicalBaseUrlForLanPlan rewrites IP-derived preview to next LAN IP', () => {
  assert.equal(
    resolveCanonicalBaseUrlForLanPlan({
      existingCanonical: 'http://192.168.1.10:8080',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    'http://192.168.1.20:8080',
  );
});

test('resolveCanonicalBaseUrlForLanPlan keeps custom hostname for preview', () => {
  assert.equal(
    resolveCanonicalBaseUrlForLanPlan({
      existingCanonical: 'http://praxis-flow.local:8080',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    'http://praxis-flow.local:8080',
  );
});

test('buildGatewayEnv points portal and API URLs to the app address reachable from gateway', () => {
  const env = buildGatewayEnv(
    {
      enabled: true,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '192.168.1.13',
      authBridgeUrl: '',
    },
    buildDeviceUrlsFromBaseUrl('http://192.168.1.13:8080'),
    'http://192.168.88.1:9100',
  );

  assert.equal(env.APP_PORTAL_URL, 'http://192.168.1.13:8080/portal');
  assert.equal(env.APP_API_URL, 'http://192.168.1.13:8080');
  assert.equal(env.APP_PORTAL_MENU_URL, 'http://192.168.1.13:8080/portal/menu');
  assert.equal(env.GATEWAY_AUTH_BRIDGE_URL, 'http://192.168.88.1:9100');
});

test('buildGatewayEnv uses explicit gateway bridge URL when provided', () => {
  const env = buildGatewayEnv(
    {
      enabled: true,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '192.168.1.13',
      authBridgeUrl: 'http://10.0.0.2:9100',
    },
    buildDeviceUrlsFromBaseUrl('http://192.168.1.13:8080'),
    'http://192.168.88.1:9100',
  );

  assert.equal(env.GATEWAY_AUTH_BRIDGE_URL, 'http://10.0.0.2:9100');
});
