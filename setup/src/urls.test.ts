import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeviceUrls, buildGatewayEnv } from './urls.js';

test('buildGatewayEnv points portal and API URLs to the app address reachable from gateway', () => {
  const env = buildGatewayEnv(
    {
      enabled: true,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '192.168.1.13',
      authBridgeUrl: '',
    },
    buildDeviceUrls('192.168.1.13'),
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
    buildDeviceUrls('192.168.1.13'),
    'http://192.168.88.1:9100',
  );

  assert.equal(env.GATEWAY_AUTH_BRIDGE_URL, 'http://10.0.0.2:9100');
});
