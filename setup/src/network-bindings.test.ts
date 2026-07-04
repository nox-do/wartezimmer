import assert from 'node:assert/strict';
import test from 'node:test';
import type { NetworkInterfaceInfo } from './network.js';
import {
  auditNetworkBindings,
  hostHasLanIp,
  interfaceExists,
  interfaceHasIpv4,
} from './network-bindings.js';

const sampleInterfaces: NetworkInterfaceInfo[] = [
  {
    name: 'en0',
    addresses: [{ family: 'IPv4', address: '192.168.1.13', internal: false }],
  },
  {
    name: 'eth1',
    addresses: [{ family: 'IPv4', address: '192.168.88.1', internal: false }],
  },
];

test('interfaceExists finds configured gateway interface', () => {
  assert.equal(interfaceExists(sampleInterfaces, 'eth1'), true);
  assert.equal(interfaceExists(sampleInterfaces, 'eth9'), false);
});

test('interfaceHasIpv4 matches address on interface', () => {
  assert.equal(interfaceHasIpv4(sampleInterfaces, 'eth1', '192.168.88.1'), true);
  assert.equal(interfaceHasIpv4(sampleInterfaces, 'eth1', '10.0.0.1'), false);
});

test('hostHasLanIp detects configured LAN address', () => {
  assert.equal(hostHasLanIp(sampleInterfaces, '192.168.1.13'), true);
  assert.equal(hostHasLanIp(sampleInterfaces, '192.168.1.99'), false);
});

test('auditNetworkBindings skips gateway NIC checks when compose unsupported', async () => {
  const env = new Map([
    ['GATEWAY_INTERFACE', 'en0'],
    ['GATEWAY_IP', '192.168.88.1'],
    ['GATEWAY_AUTH_BRIDGE_URL', 'http://host.docker.internal:9100'],
  ]);
  const checks = await auditNetworkBindings({
    env,
    compose: null,
    configuredLanIp: '192.168.1.13',
    gatewayComposeSupported: false,
    interfaces: sampleInterfaces,
  });
  assert.ok(checks.some((check) => check.id === 'gateway.platform' && check.ok));
  assert.ok(!checks.some((check) => check.id === 'gateway.ip-on-interface'));
  assert.ok(!checks.some((check) => check.id === 'gateway.compose'));
});
