import assert from 'node:assert/strict';
import test from 'node:test';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import { unwrapSetupApiResponse, type SetupApiCallResponse } from './ipc-channels.js';

test('IPC DTO and preload unwrapping preserve the complete public error', async () => {
  const original = new ManagerApiError(
    {
      code: 'example',
      category: 'conflict',
      message: 'Bitte warten',
      retryable: true,
      detail: 'Öffentlicher Hinweis',
      phase: 'prepare',
    },
    { cause: new Error('private') },
  );
  const response: SetupApiCallResponse = structuredClone({ ok: false, error: original.toJSON() });
  await assert.rejects(
    async () => unwrapSetupApiResponse(response),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error instanceof ManagerApiError);
      assert.deepEqual(error.toJSON(), original.toJSON());
      assert.equal(error.cause, undefined);
      return true;
    },
  );
  const result = { ok: false, failedPhase: 'restore', rollbackAttempted: true };
  assert.equal(unwrapSetupApiResponse({ ok: true, value: result }), result);
});
