import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maintenanceStaffBindingPreflightError,
  maintenanceStaffBindingRuntimeError,
} from './maintenance-staff-binding.js';

const interfaces = [
  {
    name: 'en0',
    addresses: [{ family: 'IPv4' as const, address: '192.168.1.10', internal: false }],
  },
];

function proxyEnv(staffIp: string) {
  return new Map([
    ['PROXY_ENABLED', 'true'],
    ['PROXY_MODE', 'http'],
    ['SETUP_LAN_APP_IP', staffIp],
    ['APP_BIND_ADDRESS', '127.0.0.1'],
  ]);
}

test('maintenance preflight distinguishes an invalid current and target Staff address', () => {
  assert.match(
    maintenanceStaffBindingPreflightError({
      currentEnv: proxyEnv('192.168.1.99'),
      targetEnv: proxyEnv('192.168.1.10'),
      interfaces,
    }) || '',
    /Aktueller Netzwerkzustand ungültig/,
  );
  assert.match(
    maintenanceStaffBindingPreflightError({
      currentEnv: proxyEnv('192.168.1.10'),
      targetEnv: proxyEnv('192.168.1.99'),
      interfaces,
    }) || '',
    /Geplanter Netzwerkzustand ungültig/,
  );
});

test('maintenance runtime audit rejects a globally published proxy', () => {
  const compose = {
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
          { hostIp: '0.0.0.0', publishedPort: 80, targetPort: 80, protocol: 'tcp' },
        ],
      },
    ],
  };
  assert.match(
    maintenanceStaffBindingRuntimeError(proxyEnv('192.168.1.10'), compose) || '',
    /unerwartete Host-Bindings/,
  );
  compose.services[2]!.publishedBindings![0]!.hostIp = '192.168.1.10';
  assert.equal(maintenanceStaffBindingRuntimeError(proxyEnv('192.168.1.10'), compose), null);
});
