import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { factoryResetInstallation, resetManagedInstallArtifacts } from './factory-reset.js';

test('managed artifact reset preserves backups, active operations and unrelated files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-factory-files-'));
  try {
    for (const relative of [
      '.env',
      'manager-state.json',
      'docker-compose.delivery.yml',
      'proxy/Caddyfile',
      'state/tls/private/key.pem',
      'backups/keep.pfbackup',
      'operations/install/active/release.pfinstall',
      'user-note.txt',
    ]) {
      const target = path.join(home, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'x');
    }
    resetManagedInstallArtifacts(home);
    assert.equal(fs.existsSync(path.join(home, '.env')), false);
    assert.equal(fs.existsSync(path.join(home, 'state/tls')), false);
    assert.equal(fs.existsSync(path.join(home, 'backups/keep.pfbackup')), true);
    assert.equal(
      fs.existsSync(path.join(home, 'operations/install/active/release.pfinstall')),
      true,
    );
    assert.equal(fs.existsSync(path.join(home, 'user-note.txt')), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('factory reset stops before deleting host files when compose teardown fails', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-factory-down-'));
  try {
    fs.writeFileSync(path.join(home, '.env'), 'KEEP=true\n');
    await assert.rejects(
      factoryResetInstallation(
        { home, mode: 'install', composeProjectName: 'wartezimmer', templateRoot: home },
        home,
        { composeDown: async () => ({ ok: false, log: 'busy' }) },
      ),
      /INSTALL_COMPOSE_TEARDOWN_FAILED/,
    );
    assert.equal(fs.existsSync(path.join(home, '.env')), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('factory reset removes only residual volumes owned by the expected compose project', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-factory-volume-'));
  const removed: string[] = [];
  try {
    fs.writeFileSync(path.join(home, '.env'), 'OLD=true\n');
    await factoryResetInstallation(
      { home, mode: 'install', composeProjectName: 'wartezimmer', templateRoot: home },
      home,
      {
        composeDown: async () => ({ ok: true, log: '' }),
        inspectVolume: async (name) => ({
          exists: name.endsWith('_app_data'),
          project: 'wartezimmer',
        }),
        removeVolume: async (name) => {
          removed.push(name);
        },
      },
    );
    assert.deepEqual(removed, ['wartezimmer_app_data']);
    assert.equal(fs.existsSync(path.join(home, '.env')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('factory reset refuses a same-named volume without matching compose ownership', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-factory-conflict-'));
  try {
    fs.writeFileSync(path.join(home, '.env'), 'KEEP=true\n');
    await assert.rejects(
      factoryResetInstallation(
        { home, mode: 'install', composeProjectName: 'wartezimmer', templateRoot: home },
        home,
        {
          composeDown: async () => ({ ok: true, log: '' }),
          inspectVolume: async () => ({ exists: true, project: 'foreign-project' }),
          removeVolume: async () => assert.fail('foreign volume must not be removed'),
        },
      ),
      /INSTALL_VOLUME_OWNERSHIP_CONFLICT/,
    );
    assert.equal(fs.existsSync(path.join(home, '.env')), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
