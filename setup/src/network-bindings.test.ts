import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComposeStatus } from '@wartezimmer/server-shared';
import type { NetworkInterfaceInfo } from './network.js';
import {
  auditNetworkBindings,
  auditStaffPublishedBindings,
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

function proxyCompose(...ports: number[]): ComposeStatus {
  return {
    running: true,
    services: [
      {
        name: 'proxy',
        service: 'proxy',
        state: 'running',
        health: 'healthy',
        publishedBindings: ports.map((port) => ({
          hostIp: '192.168.1.13',
          publishedPort: port,
          targetPort: port,
          protocol: 'tcp',
        })),
      },
    ],
  };
}

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

test('auditStaffPublishedBindings accepts exact TLS proxy, app and sandbox bindings', () => {
  const checks = auditStaffPublishedBindings({
    compose: {
      running: true,
      services: [
        {
          name: 'app',
          service: 'app',
          state: 'running',
          health: 'healthy',
          publishedBindings: [
            { hostIp: '127.0.0.1', publishedPort: 8080, targetPort: 8080, protocol: 'tcp' },
            { hostIp: '127.0.0.1', publishedPort: 8082, targetPort: 8082, protocol: 'tcp' },
          ],
        },
        {
          name: 'sandbox',
          service: 'sandbox',
          state: 'running',
          health: 'healthy',
          publishedBindings: [],
        },
        {
          name: 'proxy',
          service: 'proxy',
          state: 'running',
          health: 'healthy',
          publishedBindings: [
            {
              hostIp: '192.168.1.13',
              publishedPort: 80,
              targetPort: 80,
              protocol: 'tcp',
            },
            {
              hostIp: '192.168.1.13',
              publishedPort: 443,
              targetPort: 443,
              protocol: 'tcp',
            },
          ],
        },
      ],
    },
    staffIp: '192.168.1.13',
    proxyEnabled: true,
    proxyHttpsEnabled: true,
  });

  assert.deepEqual(
    checks.map((check) => [check.id, check.ok]),
    [
      ['staff.binding.app', true],
      ['staff.binding.sandbox', true],
      ['staff.binding.proxy', true],
    ],
  );
});

test('host audit treats port 443 as optional only during TLS commissioning', async () => {
  const cases = [
    ['commissioning without 443', 'http', 'awaiting-operator-dns', [80], true],
    ['commissioning with 443', 'http', 'awaiting-operator-dns', [80, 443], true],
    ['commissioning with unrelated port', 'http', 'awaiting-operator-dns', [80, 444], false],
    ['TLS cutover without 443', 'tls-custom', 'active', [80], false],
  ] as const;

  for (const [name, proxyMode, tlsState, ports, expected] of cases) {
    const checks = await auditNetworkBindings({
      env: new Map([
        ['PROXY_ENABLED', 'true'],
        ['PROXY_MODE', proxyMode],
        ['TLS_STATE', tlsState],
      ]),
      compose: proxyCompose(...ports),
      configuredLanIp: '192.168.1.13',
      interfaces: sampleInterfaces,
    });
    assert.equal(checks.find((check) => check.id === 'staff.binding.proxy')?.ok, expected, name);
  }
});

test('auditStaffPublishedBindings accepts the proxy-free demo bind but rejects unknown bindings', () => {
  const checks = auditStaffPublishedBindings({
    compose: {
      running: true,
      services: [
        {
          name: 'app',
          service: 'app',
          state: 'running',
          health: 'healthy',
          publishedBindings: [
            { hostIp: '0.0.0.0', publishedPort: 8080, targetPort: 8080, protocol: 'tcp' },
            { hostIp: '127.0.0.1', publishedPort: 8082, targetPort: 8082, protocol: 'tcp' },
          ],
        },
        {
          name: 'sandbox',
          service: 'sandbox',
          state: 'running',
          health: 'healthy',
        },
      ],
    },
    staffIp: '192.168.1.13',
    proxyEnabled: false,
  });

  assert.equal(checks.find((check) => check.id === 'staff.binding.app')?.ok, true);
  assert.match(
    checks.find((check) => check.id === 'staff.binding.app')?.message ?? '',
    /initialen Betriebsmodus/,
  );
  assert.match(checks.find((check) => check.id === 'staff.binding.app')?.detail ?? '', /allen/);
  assert.equal(checks.find((check) => check.id === 'staff.binding.sandbox')?.ok, false);
  assert.match(
    checks.find((check) => check.id === 'staff.binding.sandbox')?.message ?? '',
    /nicht vollständig ermittelt/,
  );
});

test('auditStaffPublishedBindings still audits running services when expected stack is incomplete', () => {
  const checks = auditStaffPublishedBindings({
    compose: {
      running: false,
      services: [
        {
          name: 'app',
          service: 'app',
          state: 'running',
          health: 'healthy',
          publishedBindings: [
            { hostIp: '0.0.0.0', publishedPort: 8080, targetPort: 8080, protocol: 'tcp' },
            { hostIp: '127.0.0.1', publishedPort: 8082, targetPort: 8082, protocol: 'tcp' },
          ],
        },
      ],
    },
    staffIp: '192.168.1.13',
    proxyEnabled: true,
  });

  assert.equal(checks.find((check) => check.id === 'staff.binding.app')?.ok, false);
});

test('auditStaffPublishedBindings blocks proxy assessment when Staff IP is missing', () => {
  const checks = auditStaffPublishedBindings({
    compose: {
      running: true,
      services: [
        {
          name: 'proxy',
          service: 'proxy',
          state: 'running',
          health: 'healthy',
          publishedBindings: [
            { hostIp: '0.0.0.0', publishedPort: 80, targetPort: 80, protocol: 'tcp' },
          ],
        },
      ],
    },
    staffIp: null,
    proxyEnabled: true,
  });

  assert.deepEqual(checks, [
    {
      id: 'staff.binding.proxy',
      ok: false,
      message: 'Proxy-Bindung gesperrt — Staff-IP fehlt',
      detail: 'Im Manager zuerst die Adresse dieses Rechners auswählen und bestätigen.',
    },
  ]);
});

test('auditNetworkBindings skips gateway NIC checks when compose unsupported', async () => {
  const env = new Map([
    ['GATEWAY_INTERFACE', 'en0'],
    ['GATEWAY_IP', '192.168.88.1'],
    ['GATEWAY_AUTH_BRIDGE_URL', 'http://192.168.10.25:9100'],
    ['GATEWAY_AUTH_BRIDGE_BIND', '192.168.10.25'],
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
