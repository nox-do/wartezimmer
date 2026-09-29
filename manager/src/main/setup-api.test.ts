import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSetupApiUrl, setupApiTimeoutMs, callSetupApi, setupApiError } from './setup-api.js';

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

test('rebuild timeout covers recreation and runtime audit', () => {
  assert.equal(
    setupApiTimeoutMs({ method: 'POST', path: '/api/setup/host/rebuild' }),
    5 * 60 * 1000,
  );
});

test('recovery finish gets the same timeout as manual restore', () => {
  assert.equal(
    setupApiTimeoutMs({ method: 'POST', path: '/api/setup/host/install/finish' }),
    600_000,
  );
});

const backendError = {
  code: 'tls_check_failed',
  category: 'operation-failed' as const,
  message: 'Prüfung fehlgeschlagen',
  retryable: false,
  detail: 'Zertifikat prüfen',
  phase: 'check',
};

test('main preserves backend error identity and operation results', async (t) => {
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify({ error: backendError }), { status: 422 }),
  );
  await assert.rejects(
    callSetupApi('http://127.0.0.1:9190', {
      method: 'POST',
      path: '/api/setup/host/tls/check-certificate',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ManagerApiError);
      assert.deepEqual(error.toJSON(), backendError);
      return true;
    },
  );
  for (const path of ['/api/setup/host/backup/restore', '/api/setup/host/update/apply']) {
    const result = { ok: false, failedPhase: 'import', rollbackAttempted: true };
    fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify(result)));
    assert.deepEqual(await callSetupApi('http://127.0.0.1:9190', { method: 'POST', path }), result);
  }
});

test('main classifies native timeouts, fetch causes and unexpected errors', async (t) => {
  for (const [error, category, retryable] of [
    [new DOMException('native timeout', 'TimeoutError'), 'timeout', false],
    [
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect details'), { code: 'ECONNREFUSED' }),
      }),
      'unavailable',
      true,
    ],
    [new SyntaxError('secret response'), 'internal', false],
  ] as const) {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      throw error;
    });
    await assert.rejects(
      callSetupApi('http://127.0.0.1:9190', { method: 'GET', path: '/api/setup/host/status' }),
      (caught: unknown) => {
        assert.ok(caught instanceof ManagerApiError);
        assert.equal(caught.category, category);
        assert.equal(caught.retryable, retryable);
        assert.equal(caught.cause, error);
        assert.notEqual(caught.message, error.message);
        return true;
      },
    );
    fetchMock.mock.restore();
  }
  assert.equal(setupApiError(new Error('arbitrary'), true).category, 'timeout');
});

test('malformed HTTP error bodies are internal errors, never operation results', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify({ ok: false }), { status: 500 }),
  );
  await assert.rejects(
    callSetupApi('http://127.0.0.1:9190', {
      method: 'POST',
      path: '/api/setup/host/backup/restore',
    }),
    { category: 'internal' },
  );
});
