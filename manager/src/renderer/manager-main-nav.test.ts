import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import { tabDisabled } from './manager-main-nav.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/pf',
    mode: 'install',
    composeProjectName: 'pf-test',
    projectRoot: '/tmp/pf',
    envExists: true,
    envPath: '/tmp/pf/.env',
    practiceDisplayName: 'Test',
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/tmp/imports', exports: '/tmp/exports' },
    appBaseUrl: 'http://192.168.1.10:8080',
    configuredCanonicalBaseUrl: null,
    network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
    gateway: null,
    deviceUrls: null,
    probes: [],
    compose: { running: true, services: [] },
    sandboxScanner: null,
    networkBindings: [],
    networkPrerequisites: [{ id: 'preflight.app-port', ok: true, message: 'Port 8080 ist frei' }],
    deliveryImages: {
      required: false,
      configured: true,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: true,
      sandboxPresent: true,
      ready: true,
    },
    ...overrides,
  };
}

test('tabDisabled allows status and wizard without host status', () => {
  assert.equal(tabDisabled('status', null), null);
  assert.equal(tabDisabled('wizard', null), null);
  assert.equal(tabDisabled('network', null), 'Noch nicht verfügbar');
  assert.equal(tabDisabled('maintenance', null), 'Noch nicht verfügbar');
});

test('tabDisabled blocks network and maintenance until setup tools are ready', () => {
  const notReady = minimalStatus({
    envExists: false,
    docker: { installed: false, daemonRunning: false, composeAvailable: false, detail: null },
  });
  assert.equal(tabDisabled('network', notReady), 'Nach der Einrichtung verfügbar');
  assert.equal(tabDisabled('maintenance', notReady), 'Nach der Einrichtung verfügbar');
  assert.equal(tabDisabled('status', notReady), null);
});

test('tabDisabled enables network and maintenance when env and docker are ready', () => {
  const ready = minimalStatus();
  assert.equal(tabDisabled('network', ready), null);
  assert.equal(tabDisabled('maintenance', ready), null);
});
