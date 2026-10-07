import assert from 'node:assert/strict';
import test from 'node:test';
import { ManagerApiError } from '@wartezimmer/server-shared/setup-api';
import { resolveSetupApiError } from './api-error.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import { createHostMutationLock } from './host-mutation-lock.js';
import { TlsRuntimeUnavailableError, TlsPermanentCheckError } from './host-tls.js';

test('backend maps controlled categories centrally', () => {
  for (const [error, status, category, code, retryable] of [
    [new SetupApiValidationError('Eingabe prüfen'), 400, 'validation', 'validation_failed', false],
    [
      new TlsRuntimeUnavailableError('Noch nicht bereit'),
      503,
      'unavailable',
      'tls_runtime_unavailable',
      true,
    ],
    [new TlsPermanentCheckError('PEM prüfen'), 422, 'operation-failed', 'tls_check_failed', false],
  ] as const) {
    assert.deepEqual(resolveSetupApiError(error), {
      status,
      body: { error: { code, category, message: error.message, retryable } },
    });
  }
});

test('backend maps actual mutation conflicts to 409', async () => {
  const lock = createHostMutationLock();
  await lock.run('first', async () => {
    await assert.rejects(
      lock.run('second', async () => undefined),
      (error: unknown) => {
        assert.ok(error instanceof ManagerApiError);
        const response = resolveSetupApiError(error);
        assert.equal(response.status, 409);
        assert.equal(response.body.error.category, 'conflict');
        assert.equal(response.body.error.code, 'host_mutation_conflict');
        assert.equal(response.body.error.retryable, true);
        return true;
      },
    );
  });
});

test('unexpected exceptions never expose technical data or impersonate controlled errors by name', () => {
  const error = new Error('secret docker output');
  error.name = 'TlsRuntimeUnavailableError';
  const { status, body } = resolveSetupApiError(error);
  assert.equal(status, 500);
  assert.equal(body.error.category, 'internal');
  assert.equal(body.error.code, 'internal_error');
  assert.equal(body.error.retryable, false);
  assert.doesNotMatch(JSON.stringify(body), /secret|docker|stack|cause/);
  assert.equal(body.error.detail, undefined);
});
