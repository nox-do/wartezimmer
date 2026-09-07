import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readEnvMap } from './env-file.js';
import { migrateMaintenanceToken } from './setup-context.js';

function withInstall(run: (home: string) => void): void {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-token-migration-'));
  try {
    run(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('startup migration atomically adds a maintenance token to an existing env', () => {
  withInstall((home) => {
    const envPath = path.join(home, '.env');
    fs.writeFileSync(envPath, '# existing install\nPRACTICE_DISPLAY_NAME=Meyer\n');

    const result = migrateMaintenanceToken(home, () => 'm'.repeat(32));

    assert.deepEqual(result, { migrated: true, token: 'm'.repeat(32) });
    assert.equal(readEnvMap(envPath).get('PRACTICE_DISPLAY_NAME'), 'Meyer');
    assert.equal(readEnvMap(envPath).get('MAINTENANCE_TOKEN'), 'm'.repeat(32));
    assert.match(fs.readFileSync(envPath, 'utf8'), /^# existing install/m);
  });
});

test('startup migration replaces weak tokens once and then remains idempotent', () => {
  withInstall((home) => {
    const envPath = path.join(home, '.env');
    fs.writeFileSync(envPath, 'MAINTENANCE_TOKEN=change-me-maintenance-token\n');
    let generations = 0;
    const generate = () => {
      generations += 1;
      return 's'.repeat(32);
    };

    assert.equal(migrateMaintenanceToken(home, generate).migrated, true);
    assert.equal(migrateMaintenanceToken(home, generate).migrated, false);
    assert.equal(generations, 1);
    assert.equal(readEnvMap(envPath).get('MAINTENANCE_TOKEN'), 's'.repeat(32));
  });
});

test('startup migration ignores a token inherited through process.env', () => {
  withInstall((home) => {
    fs.writeFileSync(path.join(home, '.env'), 'PRACTICE_DISPLAY_NAME=Meyer\n');
    const previous = process.env.MAINTENANCE_TOKEN;
    process.env.MAINTENANCE_TOKEN = 'process-token-that-must-not-win-1234';
    try {
      migrateMaintenanceToken(home, () => 'f'.repeat(32));
      assert.equal(
        readEnvMap(path.join(home, '.env')).get('MAINTENANCE_TOKEN'),
        'f'.repeat(32),
      );
    } finally {
      if (previous === undefined) delete process.env.MAINTENANCE_TOKEN;
      else process.env.MAINTENANCE_TOKEN = previous;
    }
  });
});

test('startup migration does not create env for an uninstalled home', () => {
  withInstall((home) => {
    assert.deepEqual(migrateMaintenanceToken(home, () => 'n'.repeat(32)), {
      migrated: false,
      token: null,
    });
    assert.equal(fs.existsSync(path.join(home, '.env')), false);
  });
});
