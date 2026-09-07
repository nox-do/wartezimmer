import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildTestPfupdateArchive } from './pfupdate-test-fixtures.js';
import { inspectPfupdate } from './pfupdate-inspect.js';
import type { SetupContext } from './setup-context.js';

function testCtx(home: string): SetupContext {
  return {
    home,
    composeProjectName: 'pf-test',
    mode: 'install',
    templateRoot: home,
  };
}

test('inspectPfupdate returns preview for valid package', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-inspect-ok-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  buildTestPfupdateArchive(archivePath, '2026.08.0');

  try {
    const result = await inspectPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
    );

    assert.equal(result.ok, true);
    assert.equal(result.package?.releaseVersion, '2026.08.0');
    assert.equal(result.compatibility.updateSupported, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectPfupdate rejects missing archive without throwing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-inspect-missing-'));

  try {
    const result = await inspectPfupdate(
      { archivePath: path.join(dir, 'missing.pfupdate'), managerVersion: '0.2.0' },
      testCtx(dir),
    );

    assert.equal(result.ok, false);
    assert.equal(result.compatibility.updateSupported, false);
    assert.match(result.errors?.join(' ') ?? '', /PFUPDATE_ARCHIVE_NOT_FOUND|nicht gelesen/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectPfupdate rejects missing or invalid manager versions before package inspection', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-inspect-version-'));
  try {
    for (const managerVersion of [undefined, '', 'newest']) {
      const result = await inspectPfupdate(
        { archivePath: path.join(dir, 'unused.pfupdate'), managerVersion },
        testCtx(dir),
      );
      assert.equal(result.ok, false);
      assert.match(result.errors?.join(' ') ?? '', /Manager-Version/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectPfupdate marks manager incompatibility', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-inspect-manager-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  buildTestPfupdateArchive(archivePath, '2026.08.0');

  try {
    const result = await inspectPfupdate(
      { archivePath, managerVersion: '0.0.1', settingsFormatVersion: 1 },
      testCtx(dir),
    );

    assert.equal(result.ok, false);
    assert.equal(result.compatibility.managerCompatible, false);
    assert.equal(result.compatibility.updateSupported, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectPfupdate rejects a proxyless legacy package in product mode', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-inspect-proxyless-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  buildTestPfupdateArchive(archivePath, { version: '2026.08.0', withProxy: false });
  try {
    const result = await inspectPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
    );
    assert.equal(result.ok, false);
    assert.match(result.errors?.join(' ') ?? '', /Proxy-Image/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectPfupdate returns structured error for invalid manifest', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-inspect-bad-manifest-'));
  const archivePath = path.join(dir, 'update.pfupdate');
  buildTestPfupdateArchive(archivePath, { manifestContent: '{not-json' });

  try {
    const result = await inspectPfupdate(
      { archivePath, managerVersion: '0.2.0', settingsFormatVersion: 1 },
      testCtx(dir),
    );

    assert.equal(result.ok, false);
    assert.equal(result.compatibility.updateSupported, false);
    assert.match(result.errors?.join(' ') ?? '', /JSON|manifest|Unexpected/i);
    assert.equal(fs.existsSync(path.join(dir, '.pfupdate-inspect')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
