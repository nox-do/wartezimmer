import assert from 'node:assert/strict';
import test from 'node:test';
import {
  refreshTrustedProxyAddresses,
  trustedProxyAddresses,
  refreshProxyForRequest,
} from './trusted-proxy.js';

test('proxy address refresh accepts explicit peers and fails closed for missing proxy names', async () => {
  const before = { enabled: process.env.TRUST_PROXY_HEADERS, host: process.env.TRUST_PROXY_HOST };
  try {
    process.env.TRUST_PROXY_HEADERS = 'true';
    process.env.TRUST_PROXY_HOST = '127.0.0.1';
    await refreshTrustedProxyAddresses();
    assert.deepEqual([...trustedProxyAddresses].sort(), ['127.0.0.1', '::ffff:127.0.0.1']);
    process.env.TRUST_PROXY_HOST = 'missing-pf-proxy.invalid';
    await refreshTrustedProxyAddresses();
    assert.equal(trustedProxyAddresses.size, 0);
  } finally {
    if (before.enabled === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = before.enabled;
    if (before.host === undefined) delete process.env.TRUST_PROXY_HOST;
    else process.env.TRUST_PROXY_HOST = before.host;
    trustedProxyAddresses.clear();
  }
});

test('local liveness bypasses slow proxy DNS; other requests still refresh trust', async () => {
  let refreshes = 0;
  const refresh = async () => {
    refreshes += 1;
    throw new Error('DNS unavailable');
  };
  for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    await refreshProxyForRequest(
      { method: 'GET', raw: { url: '/api/v1/ops/health', socket: { remoteAddress } } },
      refresh,
    );
  }
  assert.equal(refreshes, 0);
  for (const [url, remoteAddress] of [
    ['/api/v1/ops/health', '172.20.0.3'],
    ['/api/v1/ops/heartbeat', '127.0.0.1'],
  ]) {
    await assert.rejects(
      refreshProxyForRequest({ method: 'GET', raw: { url, socket: { remoteAddress } } }, refresh),
      /DNS unavailable/,
    );
  }
  assert.equal(refreshes, 2);
});
