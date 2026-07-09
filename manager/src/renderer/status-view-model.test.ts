import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import {
  currentWlanLabel,
  deviceUrlEntries,
  isSetupEntryStatus,
  lanWarningText,
  setupChecklistItems,
  setupEntryContent,
  setupEntryTone,
  showDeliveryImagesWarning,
  statusGridRows,
} from './status-view-model.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/pf',
    mode: 'install',
    composeProjectName: 'pf-test',
    projectRoot: '/tmp/pf',
    envExists: false,
    envPath: '/tmp/pf/.env',
    practiceDisplayName: 'Test',
    docker: {
      installed: false,
      daemonRunning: false,
      composeAvailable: false,
      detail: null,
    },
    folders: { imports: '/tmp/imports', exports: '/tmp/exports' },
    appBaseUrl: 'http://192.168.1.10:8080',
    configuredCanonicalBaseUrl: null,
    network: { configuredLanIp: null, currentLanCandidates: [], lanIpStale: false },
    gateway: null,
    deviceUrls: null,
    probes: [],
    compose: { running: false, services: [] },
    sandboxScanner: null,
    networkBindings: [],
    networkPrerequisites: [{ id: 'preflight.app-port', ok: true, message: 'Port 8080 ist frei' }],
    deliveryImages: {
      required: true,
      configured: false,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: false,
      sandboxPresent: false,
      ready: false,
    },
    ...overrides,
  };
}

test('setupEntryTone classifies fresh install', () => {
  assert.equal(setupEntryTone(minimalStatus()), 'fresh');
});

test('setupEntryTone classifies docker gap', () => {
  const status = minimalStatus({
    envExists: true,
    docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: null },
  });
  assert.equal(setupEntryTone(status), 'needs-docker');
});

test('setupEntryTone classifies missing release package', () => {
  const status = minimalStatus({
    envExists: true,
    docker: { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
    deliveryImages: {
      required: true,
      configured: false,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: false,
      sandboxPresent: false,
      ready: false,
    },
  });
  assert.equal(setupEntryTone(status), 'needs-release');
});

test('setupEntryTone classifies maintenance when setup is complete', () => {
  const status = minimalStatus({
    envExists: true,
    docker: { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
    network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
    deliveryImages: {
      required: true,
      configured: true,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: true,
      sandboxPresent: true,
      ready: true,
    },
  });
  assert.equal(setupEntryTone(status), 'maintenance');
  assert.equal(isSetupEntryStatus(status), false);
});

test('setupEntryContent adapts copy for release gap', () => {
  const status = minimalStatus({
    envExists: true,
    docker: { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
  });
  const content = setupEntryContent(status, 'needs-release');
  assert.equal(content.title, 'Software-Paket fehlt');
  assert.equal(content.showReleasePicker, true);
});

test('setupChecklistItems marks docker step open when daemon is down', () => {
  const items = setupChecklistItems(
    minimalStatus({
      envExists: true,
      docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: null },
    }),
  );
  assert.equal(items[0].done, false);
  assert.match(items[0].label, /Docker Desktop starten/);
});

test('statusGridRows includes wlan and lan when configured', () => {
  const rows = statusGridRows(
    minimalStatus({
      envExists: true,
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.20', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    ['Install-Home', 'Compose', 'Docker', '.env', 'WLAN aktuell', 'LAN in .env', 'Software-Paket'],
  );
  assert.equal(currentWlanLabel(minimalStatus({
    network: {
      configuredLanIp: null,
      currentLanCandidates: [{ address: '192.168.1.20', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  })), '192.168.1.20 (en0)');
});

test('showDeliveryImagesWarning only outside setup entry', () => {
  const status = minimalStatus({
    envExists: true,
    docker: { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
  });
  assert.equal(showDeliveryImagesWarning(status, true), false);
  assert.equal(showDeliveryImagesWarning(status, false), true);
});

test('lanWarningText covers stale lan and missing lan', () => {
  const stale = minimalStatus({
    envExists: true,
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [],
      lanIpStale: true,
    },
  });
  assert.match(lanWarningText(stale, false) ?? '', /passt nicht zur aktuellen WLAN-IP/);

  const missing = minimalStatus({ envExists: true });
  assert.match(lanWarningText(missing, false) ?? '', /LAN noch nicht konfiguriert/);
});

test('deviceUrlEntries maps device urls with tv kiosk tip', () => {
  const entries = deviceUrlEntries(
    minimalStatus({
      deviceUrls: {
        appBaseUrl: 'http://app',
        terminal: 'http://t',
        tv: 'http://tv',
        mfa: 'http://mfa',
        portal: 'http://portal',
        ops: 'http://ops',
        opsSetup: 'http://ops-setup',
      },
    }),
  );
  assert.equal(entries?.length, 5);
  assert.equal(entries?.find((entry) => entry.label === 'TV')?.showKioskTip, true);
});
