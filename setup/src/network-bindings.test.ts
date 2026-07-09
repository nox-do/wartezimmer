import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import type { NetworkInterfaceInfo } from './network.js';
import {
  auditNetworkBindings,
  auditNetworkPrerequisites,
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

async function listenEphemeral(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test('auditNetworkPrerequisites reports free app port when nothing listens', async () => {
  const checks = await auditNetworkPrerequisites({ compose: null, appPort: 59_999 });
  assert.equal(checks.length, 1);
  assert.equal(checks[0]?.ok, true);
  assert.equal(checks[0]?.message, 'Port 59999 ist frei');
});

test('auditNetworkPrerequisites blocks when foreign process holds the port', async () => {
  const listener = await listenEphemeral();
  try {
    const checks = await auditNetworkPrerequisites({ compose: null, appPort: listener.port });
    assert.equal(checks[0]?.ok, false);
    assert.match(checks[0]?.message ?? '', /bereits belegt/);
  } finally {
    await listener.close();
  }
});

test('auditNetworkPrerequisites blocks foreign listener even when app is running without publish', async () => {
  const listener = await listenEphemeral();
  try {
    const checks = await auditNetworkPrerequisites({
      compose: {
        running: true,
        services: [
          {
            name: 'app',
            service: 'app',
            state: 'running',
            health: 'healthy',
            publishedPorts: [],
          },
        ],
      },
      appPort: listener.port,
    });
    assert.equal(checks[0]?.ok, false);
    assert.match(checks[0]?.message ?? '', /bereits belegt/);
  } finally {
    await listener.close();
  }
});

test('auditNetworkPrerequisites accepts occupied port when our app publishes it', async () => {
  const listener = await listenEphemeral();
  try {
    const checks = await auditNetworkPrerequisites({
      compose: {
        running: true,
        services: [
          {
            name: 'app',
            service: 'app',
            state: 'running',
            health: 'healthy',
            publishedPorts: [listener.port],
          },
        ],
      },
      appPort: listener.port,
    });
    assert.equal(checks[0]?.ok, true);
    assert.match(checks[0]?.message ?? '', /Praxis Flow genutzt/);
  } finally {
    await listener.close();
  }
});

test('auditNetworkPrerequisites includes gateway bridge when enabled', async () => {
  const checks = await auditNetworkPrerequisites({
    compose: null,
    gatewayEnabled: true,
    gatewayBridgePort: 59_997,
    appPort: 59_996,
  });
  assert.equal(checks.length, 2);
  assert.ok(checks.every((check) => check.ok));
});

test('auditNetworkPrerequisites includes proxy HTTP port when proxy is enabled', async () => {
  const checks = await auditNetworkPrerequisites({
    compose: null,
    appPort: 59_995,
    proxyEnabled: true,
    proxyHttpPort: 59_994,
  });
  assert.deepEqual(
    checks.map((check) => check.id),
    ['preflight.app-port', 'preflight.proxy-http-port'],
  );
  assert.ok(checks.every((check) => check.ok));
});

test('auditNetworkPrerequisites includes proxy HTTPS port only for TLS modes', async () => {
  const checks = await auditNetworkPrerequisites({
    compose: null,
    appPort: 59_993,
    proxyEnabled: true,
    proxyHttpPort: 59_992,
    proxyHttpsEnabled: true,
    proxyHttpsPort: 59_991,
  });
  assert.deepEqual(
    checks.map((check) => check.id),
    ['preflight.app-port', 'preflight.proxy-http-port', 'preflight.proxy-https-port'],
  );
  assert.ok(checks.every((check) => check.ok));
});

test('auditNetworkPrerequisites accepts occupied proxy port when proxy publishes it', async () => {
  const listener = await listenEphemeral();
  try {
    const checks = await auditNetworkPrerequisites({
      compose: {
        running: true,
        services: [
          {
            name: 'proxy',
            service: 'proxy',
            state: 'running',
            health: 'healthy',
            publishedPorts: [listener.port],
          },
        ],
      },
      appPort: 59_990,
      proxyEnabled: true,
      proxyHttpPort: listener.port,
    });
    const proxyCheck = checks.find((check) => check.id === 'preflight.proxy-http-port');
    assert.equal(proxyCheck?.ok, true);
    assert.match(proxyCheck?.message ?? '', /Praxis Flow genutzt/);
  } finally {
    await listener.close();
  }
});

test('auditNetworkPrerequisites can skip direct app publish port', async () => {
  const checks = await auditNetworkPrerequisites({
    compose: null,
    appPublishEnabled: false,
    proxyEnabled: true,
    proxyHttpPort: 59_989,
  });
  assert.deepEqual(
    checks.map((check) => check.id),
    ['preflight.proxy-http-port'],
  );
});
