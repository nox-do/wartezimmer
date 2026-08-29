import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  copyTlsSidecarBesideExportedBackup,
  readTlsSidecarBase64BesideBackup,
  siblingTlsSidecarPath,
} from './tls-sidecar-lookup.js';

test('siblingTlsSidecarPath uses the backup timestamp token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-main-tls-name-'));
  const backupPath = path.join(dir, 'praxis-flow-backup-2026-07-12T10-15-30-123Z.pfbackup');
  assert.equal(
    siblingTlsSidecarPath(backupPath),
    path.join(dir, 'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz'),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readTlsSidecarBase64BesideBackup reads sibling bytes and skips missing files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-main-tls-sidecar-'));
  const backupPath = path.join(dir, 'praxis-flow-backup-2026-07-12T10-15-30-123Z.pfbackup');
  const sidecarPath = path.join(dir, 'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz');
  try {
    fs.writeFileSync(backupPath, 'backup');
    assert.equal(readTlsSidecarBase64BesideBackup(backupPath), null);
    fs.writeFileSync(sidecarPath, 'sidecar-bytes');
    assert.equal(readTlsSidecarBase64BesideBackup(backupPath), Buffer.from('sidecar-bytes').toString('base64'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('copyTlsSidecarBesideExportedBackup copies sibling into the export folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-main-tls-copy-'));
  const sourceDir = path.join(dir, 'src');
  const destDir = path.join(dir, 'dst');
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(destDir);
  const sourceBackup = path.join(sourceDir, 'praxis-flow-backup-2026-07-12T10-15-30-123Z.pfbackup');
  const destBackup = path.join(destDir, 'praxis-flow-backup-2026-07-12T10-15-30-123Z.pfbackup');
  try {
    fs.writeFileSync(sourceBackup, 'backup');
    fs.writeFileSync(path.join(sourceDir, 'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz'), 'sidecar-bytes');
    fs.writeFileSync(destBackup, 'backup');
    copyTlsSidecarBesideExportedBackup(sourceBackup, destBackup);
    assert.equal(
      fs.readFileSync(path.join(destDir, 'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz'), 'utf8'),
      'sidecar-bytes',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('copyTlsSidecarBesideExportedBackup keeps sidecar when the backup is renamed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-main-tls-rename-'));
  const sourceDir = path.join(dir, 'src');
  const destDir = path.join(dir, 'dst');
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(destDir);
  const sourceBackup = path.join(sourceDir, 'praxis-flow-backup-2026-07-12T10-15-30-123Z.pfbackup');
  const destBackup = path.join(destDir, 'praxis-flow-backup.pfbackup');
  try {
    fs.writeFileSync(sourceBackup, 'backup');
    fs.writeFileSync(path.join(sourceDir, 'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz'), 'sidecar-bytes');
    fs.writeFileSync(destBackup, 'backup');
    copyTlsSidecarBesideExportedBackup(sourceBackup, destBackup);
    assert.equal(
      fs.readFileSync(path.join(destDir, 'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz'), 'utf8'),
      'sidecar-bytes',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
