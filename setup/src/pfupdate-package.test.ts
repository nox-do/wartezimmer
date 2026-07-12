import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertPathInsideRoot,
  extractPfupdateArchive,
  listTarArchiveEntries,
  listTarArchiveEntriesVerbose,
  normalizeTarEntryName,
  parseVerboseTarListLine,
  parseTarVerboseListOutput,
  validateExtractedPfupdate,
  validateTarArchiveEntries,
  validateTarArchiveEntryPaths,
} from './pfupdate-package.js';
import { buildTestPfupdateArchive } from './pfupdate-test-fixtures.js';

const releaseVersion = '2026.08.0';

test('assertPathInsideRoot rejects escape attempts', () => {
  const root = path.join(os.tmpdir(), 'pfupdate-root');
  assert.throws(() => assertPathInsideRoot(root, path.join(root, '..', 'etc', 'passwd')));
});

test('parseVerboseTarListLine reads BSD tar listing', () => {
  const entry = parseVerboseTarListLine(
    '-rw-r--r--  0 ddeuter wheel       2 Jul 12 23:22 ./manifest.json',
  );
  assert.equal(entry?.type, 'file');
  assert.equal(entry?.name, 'manifest.json');
});

test('parseTarVerboseListOutput rejects unparseable lines', () => {
  assert.throws(
    () =>
      parseTarVerboseListOutput(
        [
          '-rw-r--r--  0 ddeuter wheel       2 Jul 12 23:22 ./manifest.json',
          'unexpected tar summary line',
        ].join('\n'),
      ),
    /PFUPDATE_TAR_LIST_UNPARSEABLE/,
  );
});

test('validateTarArchiveEntryPaths rejects traversal before extract', () => {
  assert.throws(
    () => validateTarArchiveEntryPaths(['../etc/passwd']),
    /PFUPDATE_TAR_PATH_UNSAFE/,
  );
  assert.throws(
    () => validateTarArchiveEntryPaths(['manifest.json', 'images/../../etc/passwd']),
    /PFUPDATE_TAR_PATH_UNSAFE/,
  );
});

test('validateTarArchiveEntries rejects symlinks', () => {
  assert.throws(
    () =>
      validateTarArchiveEntries([
        {
          rawName: './link.json -> manifest.json',
          name: 'link.json',
          type: 'symlink',
        },
      ]),
    /PFUPDATE_TAR_ENTRY_UNSUPPORTED/,
  );
});

test('normalizeTarEntryName strips ./ and trailing slashes', () => {
  assert.equal(normalizeTarEntryName('./manifest.json'), 'manifest.json');
  assert.equal(normalizeTarEntryName('images/'), 'images');
});

test('extractPfupdateArchive rejects unsafe tar entries before writing files', () => {
  const archivePath = path.join(os.tmpdir(), `pfupdate-unsafe-${Date.now()}.tar.gz`);
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-unsafe-extract-'));
  const outsideMarker = path.join(os.tmpdir(), `pfupdate-outside-${Date.now()}.txt`);
  fs.writeFileSync(outsideMarker, 'before', 'utf8');

  const pythonScript = `
import io
import tarfile

buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
    payload = b'escaped'
    info = tarfile.TarInfo(name='../../escape.txt')
    info.size = len(payload)
    archive.addfile(info, io.BytesIO(payload))

with open(${JSON.stringify(archivePath)}, 'wb') as output:
    output.write(buffer.getvalue())
`;

  const pack = spawnSync('python3', ['-c', pythonScript], { encoding: 'utf8' });
  if (pack.status !== 0) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    if (fs.existsSync(outsideMarker)) {
      fs.unlinkSync(outsideMarker);
    }
    return;
  }

  try {
    assert.throws(() => extractPfupdateArchive(archivePath, stagingDir), /PFUPDATE_TAR_PATH_UNSAFE/);
    assert.equal(fs.readFileSync(outsideMarker, 'utf8'), 'before');
    assert.equal(listTarArchiveEntries(archivePath).length > 0, true);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    if (fs.existsSync(outsideMarker)) {
      fs.unlinkSync(outsideMarker);
    }
  }
});

test('extractPfupdateArchive rejects symlink entries before extract', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-symlink-'));
  const archivePath = path.join(workDir, 'pkg.tar.gz');
  const stagingDir = path.join(workDir, 'extract');
  fs.writeFileSync(path.join(workDir, 'manifest.json'), '{}', 'utf8');
  fs.symlinkSync('manifest.json', path.join(workDir, 'link.json'));
  const pack = spawnSync('tar', ['czf', archivePath, '-C', workDir, 'manifest.json', 'link.json'], {
    encoding: 'utf8',
  });
  assert.equal(pack.status, 0, pack.stderr || 'tar pack failed');

  try {
    const entries = listTarArchiveEntriesVerbose(archivePath);
    assert.equal(
      entries.some((entry) => entry.type === 'symlink'),
      true,
    );
    assert.throws(
      () => extractPfupdateArchive(archivePath, stagingDir),
      /PFUPDATE_TAR_ENTRY_UNSUPPORTED/,
    );
    assert.equal(fs.existsSync(stagingDir), false);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('extractPfupdateArchive and validateExtractedPfupdate accept built package', () => {
  const archivePath = path.join(os.tmpdir(), `pfupdate-test-${Date.now()}.pfupdate`);
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-extract-'));
  buildTestPfupdateArchive(archivePath);
  try {
    extractPfupdateArchive(archivePath, stagingDir);
    const result = validateExtractedPfupdate(stagingDir, {
      managerVersion: '0.2.0',
      settingsFormatVersion: 1,
    });
    assert.equal(result.ok, true);
    assert.equal(result.manifest?.releaseVersion, releaseVersion);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
  }
});
