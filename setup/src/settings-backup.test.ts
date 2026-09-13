import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildPfbackupArchive,
  serializePfbackupArchive,
  validatePfbackupArchive,
} from '@praxis-flow/server-shared';
import {
  buildFullSettingsSnapshot,
  enrichManagerStateForStackBackup,
  findLatestPfbackupPath,
  getPfbackupInfo,
  validatePfbackupContent,
  validatePfbackupFile,
  writeTlsSidecarBesideBackup,
} from './settings-backup.js';
import { testSetupContext } from './test-setup-context.js';
import { parseTlsSidecarManifestFromBytes } from './tls-backup-sidecar.js';

const sampleDbSnapshot = {
  settingsFormatVersion: 1,
  exportedAt: '2026-07-12T12:00:00.000Z',
  opsSettings: {
    routingMode: 'simple',
  },
  authSettings: {
    staffPinHashMfa: 'a',
    staffPinHashOps: 'b',
    roomPanelPinHash: 'c',
  },
  messagingProviderConfigs: [],
};

const sampleSettings = {
  ...sampleDbSnapshot,
  env: { BUSINESS_TZ: 'Europe/Berlin' },
};

test('findLatestPfbackupPath skips invalid archives and returns newest valid backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pfbackup-'));
  const backupsDir = path.join(dir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  try {
    fs.writeFileSync(
      path.join(backupsDir, 'praxis-flow-backup-2026-06-25T10-00-00-000Z.pfbackup'),
      '{not-json',
    );
    const validArchive = buildPfbackupArchive({
      settings: sampleSettings,
      managerState: { release: null },
    });
    fs.writeFileSync(
      path.join(backupsDir, 'praxis-flow-backup-2026-06-24T10-00-00-000Z.pfbackup'),
      serializePfbackupArchive(validArchive),
    );
    assert.equal(
      findLatestPfbackupPath(dir),
      path.join(backupsDir, 'praxis-flow-backup-2026-06-24T10-00-00-000Z.pfbackup'),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('getPfbackupInfo reports latest valid backup path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pfbackup-info-'));
  const backupsDir = path.join(dir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const backupPath = path.join(backupsDir, 'praxis-flow-backup-2026-06-25T10-00-00-000Z.pfbackup');
  try {
    fs.writeFileSync(path.join(dir, '.env'), 'BUSINESS_TZ=Europe/Berlin\n');
    const archive = buildPfbackupArchive({
      settings: sampleSettings,
      managerState: { release: null },
    });
    fs.writeFileSync(backupPath, serializePfbackupArchive(archive));
    const info = getPfbackupInfo(testSetupContext(dir));
    assert.equal(info.latestBackupPath, backupPath);
    assert.equal(info.envPath, path.join(dir, '.env'));
    assert.equal(info.latestTlsSidecarPath, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('buildFullSettingsSnapshot merges full host env including image tags', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pfbackup-env-'));
  const envPath = path.join(dir, '.env');
  try {
    fs.writeFileSync(
      envPath,
      'BUSINESS_TZ=Europe/Berlin\nPRAXIS_FLOW_APP_IMAGE=app:1\nPRAXIS_FLOW_SANDBOX_IMAGE=sandbox:1\nPRAXIS_FLOW_GATEWAY_IMAGE=gateway:1\n',
    );
    const merged = buildFullSettingsSnapshot(sampleDbSnapshot, envPath);
    assert.deepEqual(merged.env, {
      BUSINESS_TZ: 'Europe/Berlin',
      PRAXIS_FLOW_APP_IMAGE: 'app:1',
      PRAXIS_FLOW_SANDBOX_IMAGE: 'sandbox:1',
      PRAXIS_FLOW_GATEWAY_IMAGE: 'gateway:1',
    });
    assert.equal('env' in sampleDbSnapshot, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('enrichManagerStateForStackBackup copies gateway image from env when missing in manager-state', () => {
  const enriched = enrichManagerStateForStackBackup(
    {
      release: {
        releaseVersion: '1.0.0',
        appImage: 'praxis-flow/app:1.0.0',
        sandboxImage: 'praxis-flow/sandbox:1.0.0',
        archiveSha256: null,
      },
    },
    { PRAXIS_FLOW_GATEWAY_IMAGE: 'praxis-flow/gateway:1.0.0' },
  );
  assert.equal(enriched.release?.gatewayImage, 'praxis-flow/gateway:1.0.0');
});

test('validatePfbackupContent accepts built archive', () => {
  const archive = buildPfbackupArchive({
    settings: sampleSettings,
    managerState: { release: null },
  });
  const result = validatePfbackupContent(serializePfbackupArchive(archive));
  assert.equal(result.archiveValid, true);
});

test('validatePfbackupFile reads archive from disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pfbackup-validate-'));
  const filePath = path.join(dir, 'sample.pfbackup');
  try {
    const archive = buildPfbackupArchive({
      settings: sampleSettings,
      managerState: { release: null },
    });
    fs.writeFileSync(filePath, serializePfbackupArchive(archive));
    const result = validatePfbackupFile(filePath);
    assert.equal(result.archiveValid, true);
    assert.equal(
      validatePfbackupArchive(JSON.parse(fs.readFileSync(filePath, 'utf8'))).archiveValid,
      true,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeTlsSidecarBesideBackup writes timestamp sibling when tls is not off', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tls-sidecar-write-'));
  const backupsDir = path.join(dir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const backupPath = path.join(backupsDir, 'praxis-flow-backup-2026-07-12T10-15-30-123Z.pfbackup');
  try {
    fs.writeFileSync(
      backupPath,
      serializePfbackupArchive(
        buildPfbackupArchive({
          settings: sampleSettings,
          managerState: { release: null },
        }),
      ),
    );
    fs.writeFileSync(
      path.join(dir, '.env'),
      [
        'TLS_STATE=preparing',
        'TLS_INSTALLATION_ID=7fk3m2q9',
        'TLS_HOSTNAME=staff.7fk3m2.lan.notaus.de',
        'TLS_INSTALLATION_DOMAIN=7fk3m2.lan.notaus.de',
        'TLS_STAFF_HOSTNAME=staff.7fk3m2.lan.notaus.de',
        'TLS_PORTAL_HOSTNAME=portal.7fk3m2.lan.notaus.de',
        'TLS_WILDCARD_CERTIFICATE_NAME=*.7fk3m2.lan.notaus.de',
        '',
      ].join('\n'),
    );
    const sidecarPath = writeTlsSidecarBesideBackup(testSetupContext(dir), backupPath);
    assert.equal(
      sidecarPath,
      path.join(backupsDir, 'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz'),
    );
    assert.equal(fs.existsSync(sidecarPath!), true);
    assert.deepEqual(parseTlsSidecarManifestFromBytes(fs.readFileSync(sidecarPath!)), {
      formatVersion: 2,
      installationId: '7fk3m2q9',
      hostname: 'staff.7fk3m2.lan.notaus.de',
      installationDomain: '7fk3m2.lan.notaus.de',
      staffHostname: 'staff.7fk3m2.lan.notaus.de',
      portalHostname: 'portal.7fk3m2.lan.notaus.de',
      wildcardCertificateName: '*.7fk3m2.lan.notaus.de',
    });
    assert.equal(getPfbackupInfo(testSetupContext(dir)).latestTlsSidecarPath, sidecarPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeTlsSidecarBesideBackup skips when tls is off', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tls-sidecar-off-'));
  const backupPath = path.join(dir, 'praxis-flow-backup-2026-07-12T10-15-30-123Z.pfbackup');
  try {
    fs.writeFileSync(backupPath, '{}');
    fs.writeFileSync(path.join(dir, '.env'), 'TLS_STATE=off\n');
    assert.equal(writeTlsSidecarBesideBackup(testSetupContext(dir), backupPath), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
