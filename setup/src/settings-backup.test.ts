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
} from './settings-backup.js';

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
    const info = getPfbackupInfo({ home: dir, composeProjectName: 'pf-test' });
    assert.equal(info.latestBackupPath, backupPath);
    assert.equal(info.envPath, path.join(dir, '.env'));
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
    assert.equal(validatePfbackupArchive(JSON.parse(fs.readFileSync(filePath, 'utf8'))).archiveValid, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
