import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEnvBackupPath,
  decodeEnvBackupTimestamp,
  encodeEnvBackupTimestamp,
  formatEnvBackupLabel,
  parseEnvBackupTimestampFromPath,
} from './env-backup.js';

test('encodeEnvBackupTimestamp and decodeEnvBackupTimestamp round-trip', () => {
  const date = new Date('2026-06-24T21:02:11.191Z');
  const suffix = encodeEnvBackupTimestamp(date);
  assert.equal(suffix, '2026-06-24T21-02-11-191Z');
  assert.equal(decodeEnvBackupTimestamp(suffix)?.toISOString(), date.toISOString());
});

test('buildEnvBackupPath appends encoded timestamp to env path', () => {
  assert.equal(
    buildEnvBackupPath('/opt/praxis/.env', new Date('2026-06-24T21:02:11.191Z')),
    '/opt/praxis/.env.backup-2026-06-24T21-02-11-191Z',
  );
});

test('formatEnvBackupLabel shows locale date instead of full path', () => {
  const label = formatEnvBackupLabel(
    '/Users/ddeuter/dev/playground/wartezimmer/.env.backup-2026-06-24T21-02-11-191Z',
  );
  assert.match(label, /24\.06\.2026/);
  assert.match(label, /\d{1,2}:\d{2}/);
  assert.doesNotMatch(label, /Users\/ddeuter/);
});

test('parseEnvBackupTimestampFromPath returns null for unrelated paths', () => {
  assert.equal(parseEnvBackupTimestampFromPath('/tmp/custom-backup.env'), null);
});
