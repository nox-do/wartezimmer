import assert from 'node:assert/strict';
import test from 'node:test';
import { freshInstallHostStatus, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import {
  createInitialWizardFields,
  initialLanIpSelection,
  initialPracticeDisplayName,
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
    reachabilityMode: 'lan-ip',
    customHostname: '',
    proxyEnabled: false,
    routingMode: null,
  });
});
