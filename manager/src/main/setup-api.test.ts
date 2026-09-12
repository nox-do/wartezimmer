import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSetupApiUrl, setupApiTimeoutMs } from './setup-api.js';

test('resolveSetupApiUrl keeps normalized host routes and query parameters', () => {
  const url = resolveSetupApiUrl('http://127.0.0.1:9190', '/api/setup/host/status?include=probes');
  assert.equal(url.href, 'http://127.0.0.1:9190/api/setup/host/status?include=probes');
});

test('resolveSetupApiUrl rejects dot-segment escapes after URL normalization', () => {
  assert.throws(
    () => resolveSetupApiUrl('http://127.0.0.1:9190', '/api/setup/host/../../admin'),
    /Pfad nicht erlaubt/,
  );
  assert.throws(
    () => resolveSetupApiUrl('http://127.0.0.1:9190', '/api/setup/host/%2e%2e/%2e%2e/admin'),
    /Pfad nicht erlaubt/,
  );
});

test('resolveSetupApiUrl rejects a different origin', () => {
  assert.throws(
    () =>
      resolveSetupApiUrl('http://127.0.0.1:9190', 'http://localhost:9190/api/setup/host/status'),
    /konfigurierten Ursprung/,
  );
});

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

test('setupApiTimeoutMs uses extended timeout for TLS obtain', () => {
  assert.equal(
    setupApiTimeoutMs({
      method: 'POST',
      path: '/api/setup/host/tls/obtain-certificate',
    }),
    6 * 60 * 1000,
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
