import assert from 'node:assert/strict';
import test from 'node:test';
import { freshInstallHostStatus, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import {
  buildGatewayPlanInput,
  createInitialWizardFields,
  gatewayDraftDefaults,
  gatewayEnabledPatch,
  initialLanIpSelection,
  initialPracticeDisplayName,
  validateGatewayManagementIpForUi,
} from './wizard-state.js';

test('initialPracticeDisplayName uses seed default for fresh install', () => {
  assert.equal(initialPracticeDisplayName(freshInstallHostStatus()), 'Hausarztpraxis');
});

test('initialPracticeDisplayName uses .env value when re-running setup', () => {
  const status = minimalHostStatus({
    envExists: true,
    practiceDisplayName: 'Dr. Muster',
  });
  assert.equal(initialPracticeDisplayName(status), 'Dr. Muster');
});

test('initialPracticeDisplayName stays empty when .env exists without name', () => {
  const status = minimalHostStatus({ envExists: true, practiceDisplayName: null });
  assert.equal(initialPracticeDisplayName(status), '');
});

test('initialLanIpSelection picks configured IP when it matches a candidate', () => {
  const status = minimalHostStatus({
    network: {
      configuredLanIp: '192.168.1.13',
      currentLanCandidates: [{ address: '192.168.1.13', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  });
  assert.deepEqual(initialLanIpSelection(status), {
    lanAppIp: '192.168.1.13',
    customLanIp: '',
  });
});

test('createInitialWizardFields combines LAN, practice and storage defaults', () => {
  const status = minimalHostStatus({
    envExists: true,
    practiceDisplayName: 'Praxis Sonnenschein',
    folders: { imports: '/data/imports', exports: '/data/exports' },
    network: {
      configuredLanIp: '192.168.1.50',
      currentLanCandidates: [{ address: '192.168.1.13', interfaceName: 'en0' }],
      lanIpStale: true,
    },
  });
  assert.deepEqual(createInitialWizardFields(status), {
    lanAppIp: '192.168.1.13',
    customLanIp: '',
    practiceDisplayName: 'Praxis Sonnenschein',
    importsHostPath: '/data/imports',
    exportsHostPath: '/data/exports',
    gatewayEnabled: false,
    gatewayInterface: 'eth1',
    gatewayIp: '192.168.88.1',
    portalAppIp: '192.168.1.13',
    gatewayManagementIp: '',
    reachabilityMode: 'lan-ip',
    customHostname: '',
    proxyEnabled: false,
    routingMode: null,
  });
});

test('createInitialWizardFields prefills gateway from status', () => {
  const status = minimalHostStatus({
    envExists: true,
    gateway: {
      enabled: true,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '10.0.0.5',
      authBridgeUrl: 'http://10.0.0.2:9100',
    },
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  });
  const fields = createInitialWizardFields(status);
  assert.equal(fields.gatewayEnabled, true);
  assert.equal(fields.portalAppIp, '10.0.0.5');
  assert.equal(fields.gatewayManagementIp, '10.0.0.2');
});

test('buildGatewayPlanInput builds bridge URL from management IP', () => {
  assert.deepEqual(
    buildGatewayPlanInput({
      lanAppIp: '192.168.1.10',
      customLanIp: '',
      gatewayEnabled: true,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '',
      gatewayManagementIp: '10.0.0.2',
    }),
    {
      enabled: true,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '192.168.1.10',
      authBridgeUrl: 'http://10.0.0.2:9100',
    },
  );
});

test('validateGatewayManagementIpForUi rejects guest gateway IP', () => {
  assert.match(
    validateGatewayManagementIpForUi(
      '192.168.88.1',
      { gatewayInterface: 'eth1', gatewayIp: '192.168.88.1' },
      null,
    ) ?? '',
    /Gast-Netz/,
  );
});

test('gatewayDraftDefaults fills portal IP without auto bridge default', () => {
  const network = {
    interfaces: [],
    lanCandidates: [],
    machineHostname: 'praxis-mac',
    gatewayComposeSupported: false,
  };

  assert.deepEqual(
    gatewayDraftDefaults(
      { gatewayEnabled: true, portalAppIp: '', gatewayManagementIp: '' },
      network,
      '192.168.1.10',
    ),
    { portalAppIp: '192.168.1.10' },
  );
});

test('gatewayEnabledPatch applies portal default only when enabling gateway', () => {
  const network = {
    interfaces: [],
    lanCandidates: [],
    machineHostname: 'praxis-mac',
    gatewayComposeSupported: false,
  };

  assert.deepEqual(
    gatewayEnabledPatch(
      { gatewayEnabled: false, portalAppIp: '', gatewayManagementIp: '' },
      true,
      network,
      '192.168.1.10',
    ),
    {
      gatewayEnabled: true,
      portalAppIp: '192.168.1.10',
    },
  );
});
