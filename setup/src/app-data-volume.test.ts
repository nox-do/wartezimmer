import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  APP_DB_RELATED_FILES,
  createDockerAppDataAccess,
  createLocalAppDataAccess,
} from './app-data-volume.js';

test('createDockerAppDataAccess requires configured app utility image', () => {
  assert.throws(() => createDockerAppDataAccess('pf-test', ''), /PRAXIS_FLOW_APP_IMAGE fehlt/);
});

test('createLocalAppDataAccess moveDbAside succeeds when db files are absent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-app-data-empty-'));
  const asideDir = path.join(dir, 'aside');
  try {
    await createLocalAppDataAccess(dir).moveDbAside(asideDir);
    assert.equal(fs.existsSync(asideDir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createLocalAppDataAccess backupDbFiles copies db wal and shm when present', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-app-data-backup-'));
  const backupDir = path.join(dir, 'backup');
  try {
    for (const name of APP_DB_RELATED_FILES) {
      fs.writeFileSync(path.join(dir, name), `content-${name}`);
    }
    const copied = await createLocalAppDataAccess(dir).backupDbFiles(backupDir);
    assert.deepEqual(copied.sort(), [...APP_DB_RELATED_FILES].sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
