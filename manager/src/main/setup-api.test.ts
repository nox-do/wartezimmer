import assert from 'node:assert/strict';
import test from 'node:test';
import { setupApiTimeoutMs } from './setup-api.js';

test('setupApiTimeoutMs uses extended timeout for backup restore', () => {
  assert.equal(
    setupApiTimeoutMs({
      method: 'POST',
      path: '/api/setup/host/backup/restore',
      body: { content: '{}' },
    }),
    10 * 60 * 1000,
  );
});

test('setupApiTimeoutMs uses extended timeout for software update apply', () => {
  assert.equal(
    setupApiTimeoutMs({
      method: 'POST',
      path: '/api/setup/host/update/apply',
      body: { archivePath: '/tmp/update.pfupdate' },
    }),
    15 * 60 * 1000,
  );
});

test('setupApiTimeoutMs keeps default timeout for backup inspect', () => {
  assert.equal(
    setupApiTimeoutMs({
      method: 'POST',
      path: '/api/setup/host/backup/inspect',
      body: { content: '{}' },
    }),
    30_000,
  );
});
