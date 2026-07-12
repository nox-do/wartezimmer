import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPfupdateFailure, formatPfupdateSuccess } from './pfupdate-flow.js';

test('formatPfupdateSuccess summarizes target version', () => {
  const text = formatPfupdateSuccess({
    ok: true,
    updateId: 'u1',
    report: {
      previousVersion: '2026.07.1',
      targetVersion: '2026.08.0',
      backupPath: '/tmp/backup.pfbackup',
      compose: { running: true, services: [] },
    },
  });
  assert.match(text, /2026\.08\.0/);
  assert.match(text, /2026\.07\.1/);
});

test('formatPfupdateFailure reports rollback recovery id', () => {
  const text = formatPfupdateFailure({
    ok: false,
    updateId: 'recovery-123',
    failedPhase: 'import_settings',
    rollbackAttempted: true,
    rollbackSucceeded: false,
    errors: ['import failed'],
  });
  assert.match(text, /Recovery-ID: recovery-123/);
  assert.match(text, /keine weiteren Wartungsaktionen/i);
});

test('formatPfupdateFailure reports successful rollback', () => {
  const text = formatPfupdateFailure({
    ok: false,
    updateId: 'u2',
    failedPhase: 'health_check',
    rollbackAttempted: true,
    rollbackSucceeded: true,
    errors: ['health failed'],
  });
  assert.match(text, /vorherige Version wurde wiederhergestellt/i);
});
