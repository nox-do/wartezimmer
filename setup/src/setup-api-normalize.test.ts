import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostNetworkInput } from '@wartezimmer/server-shared';
import {
  normalizeApplySetupInput,
  normalizeGatewayPlan,
  normalizeHostNetworkInput,
  normalizeRestrictedNetworkPrepareInput,
  normalizeSetupPlanInput,
  normalizeTlsCustomCertificateInput,
  normalizeTlsPrepareInput,
  normalizeTlsRenewInput,
  SetupApiValidationError,
} from './setup-api-normalize.js';

test('normalizeRestrictedNetworkPrepareInput requires an explicit warning decision', () => {
  assert.deepEqual(
    normalizeRestrictedNetworkPrepareInput({
      hostIp: ' 192.168.0.83 ',
      interfaceId: ' mac:aa:bb:cc:dd:ee:ff ',
      warningsConfirmed: true,
    }),
    {
      hostIp: '192.168.0.83',
      interfaceId: 'mac:aa:bb:cc:dd:ee:ff',
      warningsConfirmed: true,
    },
  );
  assert.throws(
    () =>
      normalizeRestrictedNetworkPrepareInput({
        hostIp: '192.168.0.83',
        interfaceId: 'name:en7',
      }),
    /warningsConfirmed/,
  );
});

test('normalizeTlsPrepareInput validates managed/custom bodies', () => {
  assert.deepEqual(
    normalizeTlsPrepareInput({
      mode: 'managed',
      hostname: ' 7fk3m2.lan.notaus.de ',
      lanIp: ' 192.168.178.112 ',
    }),
    {
      mode: 'managed',
      hostname: '7fk3m2.lan.notaus.de',
      lanIp: '192.168.178.112',
    },
  );
  assert.throws(
    () => normalizeTlsPrepareInput({ mode: 'custom', lanIp: '192.168.178.112' }),
    /hostname required/,
  );
});

test('normalizeTlsCustomCertificateInput requires both PEM strings', () => {
  assert.deepEqual(
    normalizeTlsCustomCertificateInput({ fullchainPem: ' cert ', privateKeyPem: ' key ' }),
    { fullchainPem: 'cert', privateKeyPem: 'key' },
  );
  assert.throws(
    () => normalizeTlsCustomCertificateInput({ fullchainPem: 'cert' }),
    /privateKeyPem required/,
  );
});

test('normalizeTlsRenewInput accepts empty managed body and paired custom PEM', () => {
  assert.deepEqual(normalizeTlsRenewInput({}), {});
  assert.throws(() => normalizeTlsRenewInput({ fullchainPem: 'cert' }), /gemeinsam angegeben/);
});

test('normalizeGatewayPlan applies defaults when gateway enabled', () => {
  assert.throws(
    () => normalizeGatewayPlan({ enabled: true }, '192.168.1.10'),
    SetupApiValidationError,
  );
});

test('normalizeGatewayPlan accepts explicit bridge URL when gateway enabled', () => {
  assert.deepEqual(
    normalizeGatewayPlan(
      { enabled: true, authBridgeUrl: 'http://192.168.10.25:9100' },
      '192.168.1.10',
    ),
    {
      enabled: true,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '192.168.1.10',
      authBridgeUrl: 'http://192.168.10.25:9100',
    },
  );
});

test('normalizeHostNetworkInput rejects missing gateway payload', () => {
  assert.throws(
    () => normalizeHostNetworkInput({ lanAppIp: '10.0.0.5' } as HostNetworkInput),
    SetupApiValidationError,
  );
});

test('normalizeGatewayPlan keeps disabled gateway without inventing NIC values', () => {
  assert.deepEqual(normalizeGatewayPlan({ enabled: false }, '192.168.1.10'), {
    enabled: false,
    gatewayInterface: 'eth1',
    gatewayIp: '192.168.88.1',
    portalAppIp: '192.168.1.10',
    authBridgeUrl: '',
  });
});

test('normalizeSetupPlanInput trims LAN and optional practice name', () => {
  assert.deepEqual(
    normalizeSetupPlanInput({
      lanAppIp: ' 192.168.1.20 ',
      practiceDisplayName: '  Praxis Süd ',
      gateway: {
        enabled: true,
        gatewayInterface: 'eth2',
        authBridgeUrl: 'http://192.168.10.25:9100',
      },
    }),
    {
      lanAppIp: '192.168.1.20',
      practiceDisplayName: 'Praxis Süd',
      portalAppIp: undefined,
      gateway: {
        enabled: true,
        gatewayInterface: 'eth2',
        gatewayIp: '192.168.88.1',
        portalAppIp: '192.168.1.20',
        authBridgeUrl: 'http://192.168.10.25:9100',
      },
    },
  );
});

test('normalizeSetupPlanInput allows omitted practice name', () => {
  assert.deepEqual(normalizeSetupPlanInput({ lanAppIp: '192.168.1.20' }).practiceDisplayName, '');
});

test('normalizeSetupPlanInput rejects missing lanAppIp', () => {
  assert.throws(
    () => normalizeSetupPlanInput({ lanAppIp: ' ', practiceDisplayName: 'X' }),
    SetupApiValidationError,
  );
});

test('normalizeApplySetupInput parses optional folders', () => {
  assert.deepEqual(
    normalizeApplySetupInput({
      lanAppIp: '192.168.1.10',
      practiceDisplayName: 'Praxis',
      folders: { imports: ' /a ', exports: '/b' },
      runCompose: true,
    }).folders,
    { imports: '/a', exports: '/b' },
  );
});

test('normalizeHostNetworkInput normalizes gateway for maintenance route', () => {
  assert.deepEqual(
    normalizeHostNetworkInput({
      lanAppIp: '10.0.0.5',
      restartCompose: true,
      gateway: {
        enabled: true,
        portalAppIp: '10.0.0.9',
        authBridgeUrl: 'http://192.168.10.25:9100',
      },
    }),
    {
      lanAppIp: '10.0.0.5',
      restartCompose: true,
      repairProxy: false,
      gateway: {
        enabled: true,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '10.0.0.9',
        authBridgeUrl: 'http://192.168.10.25:9100',
      },
    },
  );
});

test('normalizeHostNetworkInput keeps explicit gateway bridge URL', () => {
  assert.deepEqual(
    normalizeHostNetworkInput({
      lanAppIp: '10.0.0.5',
      gateway: {
        enabled: true,
        authBridgeUrl: ' http://10.0.0.2:9100 ',
      },
    }),
    {
      lanAppIp: '10.0.0.5',
      restartCompose: false,
      repairProxy: false,
      gateway: {
        enabled: true,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '10.0.0.5',
        authBridgeUrl: 'http://10.0.0.2:9100',
      },
    },
  );
});

test('network and setup API reject retired canonical overrides', () => {
  for (const normalize of [
    normalizeHostNetworkInput,
    normalizeSetupPlanInput,
    normalizeApplySetupInput,
  ]) {
    for (const canonicalBaseUrl of ['http://practice.local', 'https://staff.example.test', '']) {
      assert.throws(
        () => normalize({ lanAppIp: '10.0.0.5', canonicalBaseUrl, gateway: { enabled: false } }),
        /canonicalBaseUrl wird nicht mehr unterstützt/,
      );
    }
  }
});

test('normalizeHostNetworkInput accepts optional proxy config', () => {
  assert.deepEqual(
    normalizeHostNetworkInput({
      lanAppIp: '10.0.0.5',
      gateway: { enabled: false },
      proxy: { enabled: true },
    }),
    {
      lanAppIp: '10.0.0.5',
      restartCompose: false,
      repairProxy: false,
      gateway: {
        enabled: false,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '10.0.0.5',
        authBridgeUrl: '',
      },
      proxy: { enabled: true, httpPort: 80 },
    },
  );
});

test('normalizeHostNetworkInput repairProxy implies restartCompose', () => {
  const result = normalizeHostNetworkInput({
    lanAppIp: '10.0.0.5',
    repairProxy: true,
    gateway: { enabled: false },
    proxy: { enabled: true, httpPort: 80 },
  });
  assert.equal(result.repairProxy, true);
  assert.equal(result.restartCompose, true);
});

test('normalizeHostNetworkInput rejects invalid proxy.httpPort', () => {
  assert.throws(
    () =>
      normalizeHostNetworkInput({
        lanAppIp: '10.0.0.5',
        gateway: { enabled: false },
        proxy: { enabled: true, httpPort: 0 },
      }),
    SetupApiValidationError,
  );
});

test('normalizeSetupPlanInput omits proxy when absent', () => {
  const plan = normalizeSetupPlanInput({
    lanAppIp: '10.0.0.5',
    practiceDisplayName: 'Praxis',
  });
  assert.equal('proxy' in plan, false);
});

test('normalizeHostNetworkInput rejects non-origin canonicalBaseUrl', () => {
  assert.throws(
    () =>
      normalizeHostNetworkInput({
        lanAppIp: '10.0.0.5',
        canonicalBaseUrl: 'http://praxis.local/base',
        gateway: { enabled: false },
      }),
    SetupApiValidationError,
  );
});

test('normalizeHostNetworkInput rejects invalid gateway bridge URL', () => {
  assert.throws(
    () =>
      normalizeHostNetworkInput({
        lanAppIp: '10.0.0.5',
        gateway: {
          enabled: true,
          authBridgeUrl: '10.0.0.2:9100',
        },
      }),
    SetupApiValidationError,
  );
});

test('normalizeHostNetworkInput ignores gateway bridge URL when gateway is disabled', () => {
  assert.deepEqual(
    normalizeHostNetworkInput({
      lanAppIp: '10.0.0.5',
      gateway: {
        enabled: false,
        authBridgeUrl: 'not-a-url',
      },
    }),
    {
      lanAppIp: '10.0.0.5',
      restartCompose: false,
      repairProxy: false,
      gateway: {
        enabled: false,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '10.0.0.5',
        authBridgeUrl: '',
      },
    },
  );
});
