import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import {
  buildGatewayPlanInput,
  createInitialWizardFields,
  gatewayDraftDefaults,
  gatewayEnabledPatch,
  initialLanIpSelection,
  initialPracticeDisplayName,
  validateGatewayAuthBridgeUrl,
} from './wizard-state.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/praxis',
    mode: 'dev',
    composeProjectName: 'pf-praxis',
    projectRoot: '/tmp/praxis',
    envExists: false,
    envPath: '/tmp/praxis/.env',
    practiceDisplayName: null,
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/tmp/imports', exports: '/tmp/exports' },
    appBaseUrl: 'http://127.0.0.1:8080',
    network: {
      configuredLanIp: null,
      currentLanCandidates: [],
      lanIpStale: false,
    },
    gateway: null,
    deviceUrls: null,
    probes: [],
    compose: null,
    sandboxScanner: null,
    networkBindings: [],
    deliveryImages: {
      required: false,
      configured: false,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: false,
      sandboxPresent: false,
      ready: true,
    },
    ...overrides,
  };
}

test('initialPracticeDisplayName uses seed default for fresh install', () => {
  assert.equal(initialPracticeDisplayName(minimalStatus()), 'Hausarztpraxis');
});

test('initialPracticeDisplayName uses .env value when re-running setup', () => {
  const status = minimalStatus({
    envExists: true,
    practiceDisplayName: 'Dr. Muster',
  });
  assert.equal(initialPracticeDisplayName(status), 'Dr. Muster');
});

test('initialPracticeDisplayName stays empty when .env exists without name', () => {
  const status = minimalStatus({ envExists: true, practiceDisplayName: null });
  assert.equal(initialPracticeDisplayName(status), '');
});

test('initialLanIpSelection picks configured IP when it matches a candidate', () => {
  const status = minimalStatus({
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

test('initialLanIpSelection uses custom field for stale configured IP', () => {
  const status = minimalStatus({
    network: {
      configuredLanIp: '192.168.1.50',
      currentLanCandidates: [{ address: '192.168.1.13', interfaceName: 'en0' }],
      lanIpStale: true,
    },
  });
  assert.deepEqual(initialLanIpSelection(status), {
    lanAppIp: '192.168.1.13',
    customLanIp: '',
  });
});

test('initialLanIpSelection prefers live candidate when configured LAN is stale', () => {
  const status = minimalStatus({
    network: {
      configuredLanIp: '192.168.1.13',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: true,
    },
  });
  assert.deepEqual(initialLanIpSelection(status), {
    lanAppIp: '192.168.1.10',
    customLanIp: '',
  });
});

test('createInitialWizardFields combines LAN, practice and storage defaults', () => {
  const status = minimalStatus({
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
    authBridgeUrl: '',
    routingMode: 'simple',
  });
});

test('createInitialWizardFields prefills gateway from status', () => {
  const status = minimalStatus({
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
  assert.equal(fields.gatewayInterface, 'eth1');
  assert.equal(fields.portalAppIp, '10.0.0.5');
  assert.equal(fields.authBridgeUrl, 'http://10.0.0.2:9100');
});

test('buildGatewayPlanInput returns disabled payload when gateway off', () => {
  assert.deepEqual(
    buildGatewayPlanInput({
      lanAppIp: '192.168.1.10',
      customLanIp: '',
      gatewayEnabled: false,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '',
      authBridgeUrl: '',
    }),
    { enabled: false },
  );
});

test('buildGatewayPlanInput sends UI values without server-side defaults', () => {
  assert.deepEqual(
    buildGatewayPlanInput({
      lanAppIp: '192.168.1.10',
      customLanIp: '',
      gatewayEnabled: true,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '',
      authBridgeUrl: ' http://10.0.0.2:9100 ',
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

test('validateGatewayAuthBridgeUrl accepts empty and http URLs', () => {
  assert.equal(validateGatewayAuthBridgeUrl(''), null);
  assert.equal(validateGatewayAuthBridgeUrl(' http://10.0.0.2:9100 '), null);
  assert.equal(validateGatewayAuthBridgeUrl('https://gateway.example.test/bridge'), null);
});

test('validateGatewayAuthBridgeUrl rejects non-http URLs', () => {
  assert.match(validateGatewayAuthBridgeUrl('10.0.0.2:9100') ?? '', /http/);
  assert.match(validateGatewayAuthBridgeUrl('ftp://10.0.0.2:9100') ?? '', /http/);
});

test('gatewayDraftDefaults fills portal and bridge without overwriting user values', () => {
  const network = {
    interfaces: [],
    lanCandidates: [],
    defaultGatewayBridgeUrl: 'http://host.docker.internal:9100',
    gatewayComposeSupported: false,
  };

  assert.deepEqual(
    gatewayDraftDefaults(
      { gatewayEnabled: true, portalAppIp: '', authBridgeUrl: '' },
      network,
      '192.168.1.10',
    ),
    {
      portalAppIp: '192.168.1.10',
      authBridgeUrl: 'http://host.docker.internal:9100',
    },
  );
  assert.deepEqual(
    gatewayDraftDefaults(
      {
        gatewayEnabled: true,
        portalAppIp: '10.0.0.5',
        authBridgeUrl: 'http://10.0.0.2:9100',
      },
      network,
      '192.168.1.10',
    ),
    {},
  );
});

test('gatewayEnabledPatch applies defaults only when enabling gateway', () => {
  const network = {
    interfaces: [],
    lanCandidates: [],
    defaultGatewayBridgeUrl: 'http://host.docker.internal:9100',
    gatewayComposeSupported: false,
  };

  assert.deepEqual(
    gatewayEnabledPatch(
      { gatewayEnabled: false, portalAppIp: '', authBridgeUrl: '' },
      true,
      network,
      '192.168.1.10',
    ),
    {
      gatewayEnabled: true,
      portalAppIp: '192.168.1.10',
      authBridgeUrl: 'http://host.docker.internal:9100',
    },
  );
  assert.deepEqual(
    gatewayEnabledPatch(
      { gatewayEnabled: true, portalAppIp: '', authBridgeUrl: '' },
      false,
      network,
      '192.168.1.10',
    ),
    { gatewayEnabled: false },
  );
});
