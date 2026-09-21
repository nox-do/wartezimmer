import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  abortPreparedInstallOperation,
  createPreparedInstallOperation,
  installOperationDirectory,
  installOperationMarkerPath,
  markInstallOperationInstalling,
  readInstallOperation,
} from './install-operation.js';

const digest = 'a'.repeat(64);

test('install operation persists only the two planned phases', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-install-operation-'));
  try {
    const prepared = createPreparedInstallOperation({
      home,
      mode: 'replace',
      sha256: digest,
      releaseVersion: '1.2.3',
      id: '12345678-1234-1234-1234-123456789abc',
      createdAt: '2026-09-18T10:00:00.000Z',
    });
    assert.equal(prepared.phase, 'prepared');
    const marker = fs.readFileSync(installOperationMarkerPath(home), 'utf8');
    assert.doesNotMatch(marker, /archivePath|MAINTENANCE_TOKEN|SANDBOX_INTERNAL_TOKEN/);

    const installing = markInstallOperationInstalling(home, prepared.id);
    assert.equal(installing.phase, 'installing');
    assert.equal(readInstallOperation(home)?.phase, 'installing');
    assert.throws(
      () => abortPreparedInstallOperation(home, prepared.id),
      /INSTALL_OPERATION_ALREADY_INSTALLING/,
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('prepared operation can be aborted and a second active operation is rejected', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-install-abort-'));
  try {
    const prepared = createPreparedInstallOperation({
      home,
      mode: 'fresh',
      sha256: digest,
      releaseVersion: '1.2.3',
    });
    assert.throws(
      () =>
        createPreparedInstallOperation({
          home,
          mode: 'fresh',
          sha256: digest,
          releaseVersion: '1.2.4',
        }),
      /INSTALL_OPERATION_ALREADY_ACTIVE/,
    );
    abortPreparedInstallOperation(home, prepared.id);
    assert.equal(readInstallOperation(home), null);
    assert.equal(fs.existsSync(installOperationDirectory(home, prepared.id)), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('invalid operation data is rejected instead of guessed', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-install-invalid-'));
  try {
    fs.mkdirSync(path.dirname(installOperationMarkerPath(home)), { recursive: true });
    fs.writeFileSync(installOperationMarkerPath(home), '{"schemaVersion":1,"phase":"failed"}');
    assert.throws(() => readInstallOperation(home), /INSTALL_OPERATION_INVALID/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
