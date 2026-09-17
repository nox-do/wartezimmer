import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSetupApiUrl, setupApiTimeoutMs, setupApiUserErrorMessage } from './setup-api.js';

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

test('setupApiTimeoutMs uses extended timeout for restricted-network mutations', () => {
  for (const path of [
    '/api/setup/host/restricted-network/apply',
    '/api/setup/host/restricted-network/remove',
  ]) {
    assert.equal(setupApiTimeoutMs({ method: 'POST', path }), 3 * 60 * 1000);
  }
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

test('setup API user errors preserve an operator-facing validation message', () => {
  assert.equal(
    setupApiUserErrorMessage(
      new Error(
        'Setup-API /api/setup/host/restricted-network/apply: Zuerst eine Netzwerkadresse vorbereiten.',
      ),
      { path: '/api/setup/host/restricted-network/apply' },
    ),
    'Zuerst eine Netzwerkadresse vorbereiten.',
  );
});

test('setup API user errors hide listener and rollback internals', () => {
  const message = setupApiUserErrorMessage(
    new Error(
      'Setup-API /api/setup/host/restricted-network/apply: Listener-Prüfung fehlgeschlagen: Portal auf Restricted-IP nicht erreichbar (Client network socket disconnected before secure TLS connection was established)\nDer vorherige Patientenzugang wurde wiederhergestellt.\nRollback: Container praxis-flow-proxy Removed',
    ),
    { path: '/api/setup/host/restricted-network/apply' },
  );
  assert.match(message, /Aktivierung wurde zurückgenommen/);
  assert.doesNotMatch(message, /socket|Container|Rollback|praxis-flow-proxy/i);
});

test('setup API user errors replace technical-only failures with an action fallback', () => {
  assert.equal(
    setupApiUserErrorMessage(new Error('connect ECONNREFUSED 127.0.0.1:9190'), {
      path: '/api/setup/host/tls/apply',
    }),
    'Die HTTPS-Einstellung konnte nicht geändert werden. Bitte prüfen Sie die Voraussetzungen und versuchen Sie es erneut.',
  );
});

test('setup API user errors translate a token mismatch without exposing token names', () => {
  const message = setupApiUserErrorMessage(new Error('maintenance token required'), {
    path: '/api/setup/host/update/apply',
  });
  assert.match(message, /demselben Installationsstand/);
  assert.doesNotMatch(message, /token/i);
});
