import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ensureWaitSettingsSchema } from './database-wait-settings.js';
import { CoreDatabase } from './database.js';

test('existing settings gain the default once and preserve a configured threshold', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE ops_settings (id TEXT PRIMARY KEY); INSERT INTO ops_settings VALUES ('singleton')",
    );
    ensureWaitSettingsSchema(db);
    assert.equal(
      db.prepare('SELECT long_wait_threshold_minutes AS value FROM ops_settings').get()?.value,
      25,
    );
    db.exec('UPDATE ops_settings SET long_wait_threshold_minutes = 40');
    ensureWaitSettingsSchema(db);
    assert.equal(
      db.prepare('SELECT long_wait_threshold_minutes AS value FROM ops_settings').get()?.value,
      40,
    );
  } finally {
    db.close();
  }
});

test('host settings persist the threshold and reject invalid minutes without changing it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-wait-settings-'));
  const previous = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.CONTACT_LOOKUP_BASE_PATH = dir;
  try {
    const core = new CoreDatabase(':memory:');
    assert.equal(core.getOpsSettings().longWaitThresholdMinutes, 25);
    core.updateOpsSettings({ longWaitThresholdMinutes: 40 });
    assert.equal(core.getOpsSettings().longWaitThresholdMinutes, 40);
    core.updateOpsSettings({ returnWindowMinutes: 20 });
    assert.equal(core.getOpsSettings().longWaitThresholdMinutes, 40);
    for (const value of [0, 241, 1.5, NaN]) {
      assert.throws(() => core.updateOpsSettings({ longWaitThresholdMinutes: value }));
      assert.equal(core.getOpsSettings().longWaitThresholdMinutes, 40);
    }
  } finally {
    if (previous === undefined) delete process.env.CONTACT_LOOKUP_BASE_PATH;
    else process.env.CONTACT_LOOKUP_BASE_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
