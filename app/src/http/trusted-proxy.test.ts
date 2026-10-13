import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshTrustedProxyAddresses, trustedProxyAddresses } from './trusted-proxy.js';

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
