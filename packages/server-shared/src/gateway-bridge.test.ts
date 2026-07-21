import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessGatewayBridgeBind,
  buildGatewayBridgeUrl,
  deriveGatewayBridgeBindFromUrl,
  parseGatewayManagementIpFromBridgeUrl,
  parseValidGatewayManagementIpFromBridgeUrl,
  sanitizeGatewayManagementIp,
  validateGatewayManagementIp,
} from './gateway-bridge.js';

test('buildGatewayBridgeUrl formats management IP with default port', () => {
  assert.equal(buildGatewayBridgeUrl('192.168.10.25'), 'http://192.168.10.25:9100');
});

test('parseGatewayManagementIpFromBridgeUrl extracts hostname', () => {
  assert.equal(parseGatewayManagementIpFromBridgeUrl('http://192.168.10.25:9100'), '192.168.10.25');
  assert.equal(parseGatewayManagementIpFromBridgeUrl(''), null);
});

test('sanitizeGatewayManagementIp drops legacy hostnames', () => {
  assert.equal(sanitizeGatewayManagementIp('192.168.10.25'), '192.168.10.25');
  assert.equal(sanitizeGatewayManagementIp('0.0.0.0'), '0.0.0.0');
  assert.equal(sanitizeGatewayManagementIp('host.docker.internal'), '');
  assert.equal(parseValidGatewayManagementIpFromBridgeUrl('http://host.docker.internal:9100'), '');
});

test('deriveGatewayBridgeBindFromUrl returns hostname', () => {
  assert.equal(deriveGatewayBridgeBindFromUrl('http://192.168.10.25:9100'), '192.168.10.25');
  assert.equal(deriveGatewayBridgeBindFromUrl('http://0.0.0.0:9100'), '0.0.0.0');
});

test('validateGatewayManagementIp rejects guest gateway IP and guest NIC address', () => {
  const interfaces = [
    { name: 'eth0', addresses: [{ address: '192.168.10.25' }] },
    { name: 'eth1', addresses: [{ address: '192.168.88.1' }] },
  ];

  assert.match(
    validateGatewayManagementIp('192.168.88.1', {
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      interfaces,
    }) ?? '',
    /Gast-Netz/,
  );

  assert.match(
    validateGatewayManagementIp('192.168.88.1', {
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      interfaces,
    }) ?? '',
    /Gast/,
  );

  assert.equal(
    validateGatewayManagementIp('192.168.10.25', {
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      interfaces,
    }),
    null,
  );
});

test('assessGatewayBridgeBind warns on 0.0.0.0 and blocks guest NIC bind', () => {
  const interfaces = [
    { name: 'eth0', addresses: [{ address: '192.168.10.25' }] },
    { name: 'eth1', addresses: [{ address: '192.168.88.1' }] },
  ];

  assert.equal(
    assessGatewayBridgeBind('0.0.0.0', { gatewayInterface: 'eth1', gatewayIp: '192.168.88.1' })
      .level,
    'warn',
  );
  assert.equal(
    assessGatewayBridgeBind('192.168.88.1', {
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      interfaces,
    }).level,
    'block',
  );
  assert.equal(
    assessGatewayBridgeBind('192.168.10.25', {
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      interfaces,
    }).level,
    'ok',
  );
});
