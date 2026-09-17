import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PORTAL_PROXY_CONTRACT,
  parsePortalProxyContract,
} from './portal-proxy-contract.js';

test('release contract accepts changed routes, rejects unsupported renderers and Caddy injection', () => {
  assert.deepEqual(
    parsePortalProxyContract(JSON.parse(JSON.stringify(DEFAULT_PORTAL_PROXY_CONTRACT))),
    DEFAULT_PORTAL_PROXY_CONTRACT,
  );
  for (const change of [
    { rendererVersion: 999 },
    { api: [{ method: 'GET', path: '/api/v1/portal/x\nreverse_proxy evil' }] },
    { assets: [{ methods: ['GET', 'HEAD'], path: '/*' }] },
    { ui: [{ methods: ['GET', 'HEAD'], path: '/portal/*' }] },
    { internal: DEFAULT_PORTAL_PROXY_CONTRACT.api },
  ])
    assert.throws(
      () => parsePortalProxyContract({ ...DEFAULT_PORTAL_PROXY_CONTRACT, ...change }),
      /inkompatibel/,
    );
});
