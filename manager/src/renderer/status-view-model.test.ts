import assert from 'node:assert/strict';
import test from 'node:test';
import { freshInstallHostStatus, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import {
  configuredAdapterLabel,
  deviceUrlEntries,
  isSetupEntryStatus,
  lanWarningText,
  setupChecklistItems,
  setupEntryContent,
  setupEntryTone,
  showDeliveryImagesWarning,
  showStatusOverallNotice,
  statusGridRows,
  statusOverallNoticeClass,
} from './status-view-model.js';

test('setupEntryTone classifies fresh install', () => {
  assert.equal(setupEntryTone(freshInstallHostStatus()), 'fresh');
});

test('setupEntryTone classifies docker gap', () => {
  const status = minimalHostStatus({
    installation: { kind: 'docker-unavailable', reason: 'Docker down' },
    envExists: true,
    docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: null },
  });
  assert.equal(setupEntryTone(status), 'needs-docker');
});

test('setupEntryTone classifies missing release package', () => {
  const status = minimalHostStatus({
    installation: { kind: 'needs-reinstall', reasons: [] },
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
  assert.equal(setupEntryTone(status), 'review');
});

test('setupEntryTone classifies maintenance when setup is complete', () => {
  const status = minimalHostStatus({
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

test('setupEntryContent keeps completed maintenance state action-free', () => {
  const content = setupEntryContent(minimalHostStatus(), 'maintenance');
  assert.equal(content.startButtonLabel, null);
  assert.equal(content.showReleasePicker, false);
});

test('setupChecklistItems marks docker step open when daemon is down', () => {
  const items = setupChecklistItems(
    minimalHostStatus({
      envExists: true,
      docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: null },
    }),
  );
  assert.equal(items[0].done, false);
  assert.match(items[0].label, /Docker Desktop starten/);
});

test('statusGridRows shows installation details without duplicate network facts', () => {
  const rows = statusGridRows(
    minimalHostStatus({
      envExists: true,
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en7' }],
        lanIpStale: false,
      },
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
    }),
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    [
      'Installations-ID',
      'Installationsordner',
      'Konfiguration (.env)',
      'Docker-Images',
      'Compose-Projekt',
      'Docker',
    ],
  );
  assert.equal(rows[0]?.value, 'Noch nicht vergeben');
  assert.equal(rows[1]?.value, '/tmp/pf');
  assert.equal(
    configuredAdapterLabel(
      minimalHostStatus({
        network: {
          configuredLanIp: null,
          currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en7' }],
          lanIpStale: false,
        },
      }),
    ),
    null,
  );
});

test('showDeliveryImagesWarning only outside setup entry', () => {
  const status = minimalHostStatus({
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
  assert.equal(showDeliveryImagesWarning(status, true), false);
  assert.equal(showDeliveryImagesWarning(status, false), true);
});

test('lanWarningText covers stale lan and missing lan', () => {
  const stale = minimalHostStatus({
    envExists: true,
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [],
      lanIpStale: true,
    },
  });
  assert.match(lanWarningText(stale, false) ?? '', /passt nicht zur aktuellen IP/);

  const missing = minimalHostStatus({
    envExists: true,
    network: { configuredLanIp: null, currentLanCandidates: [], lanIpStale: false },
  });
  assert.match(lanWarningText(missing, false) ?? '', /LAN noch nicht konfiguriert/);
});

test('showStatusOverallNotice skips setup entry and loading placeholder', () => {
  assert.equal(showStatusOverallNotice(true, 'Betrieb'), false);
  assert.equal(showStatusOverallNotice(false, '…'), false);
  assert.equal(showStatusOverallNotice(false, 'Proxy-Server fehlt'), true);
  assert.equal(statusOverallNoticeClass('warn'), 'notice is-warn');
});

test('deviceUrlEntries maps device urls with tv kiosk tip', () => {
  const entries = deviceUrlEntries(
    minimalHostStatus({
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

test('installation ID is visible before TLS cutover', () => {
  const status = minimalHostStatus();
  status.proxy = { ...status.proxy, enabled: true, mode: 'http', container: null };
  status.tls = {
    state: 'awaiting-operator-dns',
    mode: 'managed',
    hostname: 'staff.example.test',
    installationId: 'example',
    tokenConsumed: true,
    applyReady: false,
    cutoverApplied: false,
    certificate: null,
    lastError: null,
    acmeCnameTarget: null,
  };
  const rows = statusGridRows(status);
  assert.equal(rows.find((row) => row.label === 'Installations-ID')?.value, 'example');
  assert.equal(
    rows.some((row) => row.label === 'Proxy-Server'),
    false,
  );
});

test('Docker-unavailable is authoritative even for configured HTTPS', () => {
  const status = minimalHostStatus({
    installation: { kind: 'docker-unavailable', reason: 'Docker down' },
    docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: null },
  });
  status.lifecycle = {
    assessment: 'known',
    mode: 'https',
    preparation: 'none',
    operation: 'none',
    recovery: 'none',
    issues: [],
  };
  assert.equal(setupEntryTone(status), 'needs-docker');
  assert.equal(isSetupEntryStatus(status), true);
});

test('missing env with residues offers a deliberate review, never fresh-install copy', () => {
  const status = freshInstallHostStatus();
  status.installation = { kind: 'needs-reinstall', reasons: [] };
  status.lifecycle = {
    assessment: 'inconsistent',
    mode: null,
    preparation: 'none',
    operation: 'none',
    recovery: 'none',
    issues: [],
  };
  assert.equal(setupEntryTone(status), 'review');
  assert.equal(isSetupEntryStatus(status), true);
  assert.equal(setupEntryContent(status, 'review').startButtonLabel, 'Neu installieren …');
});

for (const envExists of [false, true]) {
  for (const gap of ['missing', 'daemon', 'compose'] as const) {
    test(`Docker ${gap} with existing config=${envExists} never offers first setup or package import`, () => {
      const status = minimalHostStatus({
        envExists,
        installation: { kind: 'docker-unavailable', reason: 'Unavailable' },
        docker: {
          installed: gap !== 'missing',
          daemonRunning: gap === 'compose',
          composeAvailable: false,
          detail: null,
        },
      });
      const content = setupEntryContent(status, setupEntryTone(status));
      assert.equal(content.eyebrow, 'Status');
      assert.equal(content.startButtonLabel, null);
      assert.equal(content.showReleasePicker, false);
      assert.deepEqual(setupChecklistItems(status), []);
      assert.doesNotMatch(
        content.copy + content.note,
        /Ersteinrichtung|Einrichtung fortsetzen|Software-Paket/,
      );
      assert.match(
        content.title,
        gap === 'missing' ? /Docker fehlt/ : gap === 'daemon' ? /nicht erreichbar/ : /Compose/,
      );
    });
  }
}
