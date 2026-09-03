import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { CoreDatabase } from './database.js';

test('updateOpsSettings leaves waiting_room_full untouched and omits it from settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-waiting-room-'));
  const dbPath = join(dir, 'praxis-flow.db');
  const previousNodeEnv = process.env.NODE_ENV;
  const previousContactLookupBase = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.NODE_ENV = 'test';
  process.env.CONTACT_LOOKUP_BASE_PATH = join(dir, 'imports');

  try {
    const core = new CoreDatabase(dbPath);
    const inspect = new DatabaseSync(dbPath);
    inspect.exec('PRAGMA foreign_keys = ON');

    const columns = inspect.prepare('PRAGMA table_info(ops_settings)').all() as Array<{
      name?: string;
    }>;
    assert.ok(columns.some((row) => row.name === 'waiting_room_full'));

    inspect.prepare(`UPDATE ops_settings SET waiting_room_full = 1 WHERE id = 'singleton'`).run();

    const before = core.getOpsSettings();
    core.updateOpsSettings({ returnWindowMinutes: before.returnWindowMinutes });
    const after = core.getOpsSettings();
    assert.equal(after.returnWindowMinutes, before.returnWindowMinutes);
    assert.equal('waitingRoomFull' in after, false);

    const row = inspect
      .prepare(`SELECT waiting_room_full AS waitingRoomFull FROM ops_settings WHERE id = 'singleton'`)
      .get() as { waitingRoomFull?: number };
    assert.equal(row.waitingRoomFull, 1);

    inspect.close();
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousContactLookupBase === undefined) {
      delete process.env.CONTACT_LOOKUP_BASE_PATH;
    } else {
      process.env.CONTACT_LOOKUP_BASE_PATH = previousContactLookupBase;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
