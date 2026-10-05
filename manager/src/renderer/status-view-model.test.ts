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
  statusGridRows,
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

test('setupEntryTone classifies missing release state', () => {
  const status = minimalHostStatus({
    installation: { kind: 'inconsistent', reasons: [] },
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

test('starting installation retains its detail layout without a checklist', () => {
  const status = minimalHostStatus({ installation: { kind: 'starting' } });
  const tone = setupEntryTone(status);
  assert.equal(tone, 'starting');
  assert.equal(isSetupEntryStatus(status), true);
  assert.deepEqual(setupChecklistItems(status), []);
});

test('completed maintenance details do not show a release picker', () => {
  const content = setupEntryContent(minimalHostStatus(), 'maintenance');
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
  status.installation = { kind: 'inconsistent', reasons: [] };
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
      assert.equal(content.showReleasePicker, false);
      assert.deepEqual(setupChecklistItems(status), []);
      assert.doesNotMatch(
        content.copy + content.note,
        /Ersteinrichtung|Einrichtung fortsetzen|Software-Paket/,
      );
    });
  }
}

test('installation detail copy preserves reasons and repair checklist behavior', () => {
  for (const kind of ['needs-reinstall', 'needs-repair', 'inconsistent'] as const) {
    const status = minimalHostStatus({
      installation: { kind, reasons: [{ code: 'test', message: 'Konkreter Grund' }] },
    });
    const content = setupEntryContent(status, setupEntryTone(status));
    assert.equal(content.copy, 'Konkreter Grund');
    if (kind !== 'needs-reinstall') {
      assert.doesNotMatch(content.note, /Neuinstallation|Backup/);
      assert.deepEqual(setupChecklistItems(status), []);
    }
  }
});

test('installation facts and optional diagnostics have distinct contents', () => {
  const status = minimalHostStatus();
  const facts = statusGridRows(status, 'installation');
  const diagnostics = statusGridRows(status, 'diagnosis');
  assert.deepEqual(
    facts.map((row) => row.label),
    ['Installations-ID', 'Installationsordner'],
  );
  assert.deepEqual(
    diagnostics.map((row) => row.label),
    ['Konfiguration (.env)', 'Compose-Projekt', 'Docker'],
  );
  assert.equal(facts.length + diagnostics.length, statusGridRows(status).length);
  const versioned = minimalHostStatus({
    deliveryImages: { ...status.deliveryImages, releaseVersion: '6.1.0' },
  });
  assert.equal(
    statusGridRows(versioned, 'installation').find((row) => row.label === 'Software-Version')
      ?.value,
    '6.1.0',
  );
});

test('external portal URL appears only after activation and disappears after removal', () => {
  const status = minimalHostStatus({
    deviceUrls: {
      appBaseUrl: 'https://staff.example.test',
      terminal: 'https://staff.example.test/terminal',
      tv: 'https://staff.example.test/tv',
      mfa: 'https://staff.example.test/mfa',
      portal: 'https://staff.example.test/portal',
      ops: 'https://staff.example.test/ops',
      opsSetup: 'https://staff.example.test/ops/setup',
    },
  });
  const portal = status.restrictedNetwork!;
  portal.portalHostname = 'portal.example.test';
  portal.phase = 'prepared';
  assert.equal(
    deviceUrlEntries(status)?.some((entry) => entry.label === 'Portal - extern'),
    false,
  );
  portal.phase = 'applied';
  assert.deepEqual(deviceUrlEntries(status)?.at(-1), {
    label: 'Portal - extern',
    url: 'https://portal.example.test/portal',
    showKioskTip: false,
  });
  assert.ok(deviceUrlEntries(status)?.some((entry) => entry.url === status.deviceUrls!.portal));
  portal.portalHostname = null;
  assert.equal(deviceUrlEntries(status)?.length, 5);
  portal.portalHostname = 'portal.example.test';
  portal.phase = 'unconfigured';
  assert.equal(deviceUrlEntries(status)?.length, 5);
});
