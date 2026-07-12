import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  HostStatus,
  LoadDeliveryImagesResult,
  StorageFoldersResult,
} from '../shared/host-status.js';
import {
  backupInfoText,
  fileSharingHintText,
  logsDisplayText,
  pinResetSuccessText,
  routingModeSaveDisabled,
  routingModeSuccessText,
  showRestartBuildButton,
  softwareUpdateErrorText,
  softwareUpdateInfoRows,
  softwareUpdateSectionVisible,
  softwareUpdateStatusText,
  stackStatusLabel,
  storagePathsChanged,
  storageSaveErrorText,
  storageSaveStatusText,
  storageWarningText,
} from './maintenance-view-model.js';

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

function minimalStorageResult(overrides: Partial<StorageFoldersResult> = {}): StorageFoldersResult {
  return {
    envPath: '/tmp/pf/.env',
    backupPath: null,
    folders: { imports: '/data/imports', exports: '/data/exports' },
    created: [],
    composeRestarted: false,
    stackWasRunning: false,
    compose: null,
    restartLog: null,
    ...overrides,
  };
}

function minimalSoftwareResult(
  overrides: Partial<LoadDeliveryImagesResult> = {},
): LoadDeliveryImagesResult {
  return {
    envPath: '/tmp/pf/.env',
    backupPath: null,
    loadedImages: [],
    appImage: 'praxis-flow/app:1.0',
    sandboxImage: 'praxis-flow/sandbox:1.0',
    deliveryImages: minimalStatus().deliveryImages,
    sha256Verified: true,
    sha256: 'abc',
    releaseVersion: null,
    sha256Source: 'manifest.json',
    composeRestarted: false,
    compose: null,
    restartLog: null,
    ...overrides,
  };
}

test('backupInfoText covers backup, missing backup, and missing env', () => {
  assert.match(
    backupInfoText('/tmp/backups/praxis-flow-backup-2026-06-25T10-00-00-000Z.pfbackup', true),
    /^Letztes Backup:/,
  );
  assert.equal(backupInfoText(null, true), 'Noch kein Backup vorhanden.');
  assert.equal(backupInfoText(null, false), 'Keine .env vorhanden.');
});

test('stackStatusLabel reflects compose running state', () => {
  assert.equal(stackStatusLabel(true), 'Läuft');
  assert.equal(stackStatusLabel(false), 'Gestoppt');
});

test('showRestartBuildButton only for repo mode', () => {
  assert.equal(showRestartBuildButton('repo'), true);
  assert.equal(showRestartBuildButton('install'), false);
  assert.equal(showRestartBuildButton(undefined), false);
});

test('logsDisplayText falls back to empty placeholder', () => {
  assert.equal(logsDisplayText(''), '(keine Logs)');
  assert.equal(logsDisplayText('line 1'), 'line 1');
});

test('storagePathsChanged compares trimmed draft paths to current folders', () => {
  const current = { imports: '/data/in', exports: '/data/out' };
  assert.equal(storagePathsChanged('/data/in', '/data/out', current), false);
  assert.equal(storagePathsChanged(' /data/in ', '/data/out', current), false);
  assert.equal(storagePathsChanged('/data/in', '/other/out', current), true);
  assert.equal(storagePathsChanged('/data/in', '/data/out', undefined), false);
});

test('storageWarningText only when stack runs and paths changed', () => {
  assert.match(storageWarningText(true, true) ?? '', /Stack-Neustart/);
  assert.equal(storageWarningText(true, false), null);
  assert.equal(storageWarningText(false, true), null);
});

test('softwareUpdateSectionVisible follows deliveryImages.required', () => {
  assert.equal(softwareUpdateSectionVisible(minimalStatus()), true);
  assert.equal(
    softwareUpdateSectionVisible(
      minimalStatus({
        deliveryImages: {
          ...minimalStatus().deliveryImages,
          required: false,
        },
      }),
    ),
    false,
  );
  assert.equal(softwareUpdateSectionVisible(null), false);
});

test('softwareUpdateInfoRows includes summary and configured images', () => {
  const status = minimalStatus({
    deliveryImages: {
      required: true,
      configured: true,
      appImage: 'praxis-flow/app:2.0',
      sandboxImage: 'praxis-flow/sandbox:2.0',
      releaseVersion: '2.0.0',
      archiveSha256: 'deadbeef',
      appPresent: true,
      sandboxPresent: true,
      ready: true,
    },
  });
  const rows = softwareUpdateInfoRows(status);
  assert.equal(rows[0]?.label, 'Aktuell');
  assert.match(rows[0]?.value ?? '', /praxis-flow\/app:2.0/);
  assert.deepEqual(
    rows.slice(1).map((row) => row.label),
    ['app', 'sandbox'],
  );
});

test('routingModeSaveDisabled blocks while busy, unknown, unchanged, or open waiting numbers', () => {
  assert.equal(routingModeSaveDisabled(true, 'simple', 'complex'), true);
  assert.equal(routingModeSaveDisabled(false, null, 'simple'), true);
  assert.equal(routingModeSaveDisabled(false, 'simple', null), true);
  assert.equal(routingModeSaveDisabled(false, 'simple', 'simple'), true);
  assert.equal(routingModeSaveDisabled(false, 'complex', 'simple'), false);
  assert.equal(routingModeSaveDisabled(false, 'complex', 'simple', 2), true);
});

test('routingModeSuccessText names active routing mode', () => {
  assert.match(routingModeSuccessText('complex'), /Complex Routing aktiv/);
  assert.match(routingModeSuccessText('simple'), /Simple Routing aktiv/);
});

test('fileSharingHintText only on platforms that need Docker file sharing', () => {
  assert.notEqual(fileSharingHintText('darwin'), null);
  assert.match(fileSharingHintText('darwin') ?? '', /Docker Desktop/);
  assert.equal(fileSharingHintText('linux'), null);
});

test('storageSaveStatusText summarizes save outcome', () => {
  const withRestart = storageSaveStatusText(
    minimalStorageResult({
      created: ['/data/imports'],
      backupPath: '/tmp/.env.backup-1',
      composeRestarted: true,
      stackWasRunning: true,
    }),
    true,
  );
  assert.match(withRestart, /Pfade gespeichert/);
  assert.match(withRestart, /Ordner angelegt/);
  assert.match(withRestart, /Stack neu gestartet/);

  const restartFailed = storageSaveStatusText(
    minimalStorageResult({ stackWasRunning: true, composeRestarted: false }),
    true,
  );
  assert.match(restartFailed, /manuell neu starten/);

  const needsRestart = storageSaveStatusText(
    minimalStorageResult({ stackWasRunning: true }),
    false,
  );
  assert.match(needsRestart, /Neustart empfohlen/);
});

test('storageSaveErrorText surfaces restart failure log', () => {
  assert.equal(
    storageSaveErrorText(
      minimalStorageResult({
        stackWasRunning: true,
        composeRestarted: false,
        restartLog: 'compose down failed',
      }),
      true,
    ),
    'compose down failed',
  );
  assert.equal(storageSaveErrorText(minimalStorageResult(), false), null);
});

test('softwareUpdateStatusText summarizes import and restart outcome', () => {
  const withoutRestart = softwareUpdateStatusText(
    minimalSoftwareResult({
      releaseVersion: '2.0.0',
      backupPath: '/tmp/.env.backup-2',
    }),
    false,
  );
  assert.match(withoutRestart, /Import OK/);
  assert.match(withoutRestart, /Version: 2.0.0/);
  assert.match(withoutRestart, /Stack unverändert/);

  const withRestart = softwareUpdateStatusText(
    minimalSoftwareResult({ composeRestarted: true }),
    true,
  );
  assert.match(withRestart, /neu gestartet/);
});

test('softwareUpdateErrorText returns restart log on failed restart', () => {
  assert.equal(
    softwareUpdateErrorText(
      minimalSoftwareResult({ composeRestarted: false, restartLog: 'pull failed' }),
      true,
    ),
    'pull failed',
  );
  assert.equal(softwareUpdateErrorText(minimalSoftwareResult(), true), null);
});

test('pinResetSuccessText mentions default pin', () => {
  assert.match(pinResetSuccessText('0000'), /0000/);
  assert.match(pinResetSuccessText('0000'), /MFA-PIN in MFA/);
});
