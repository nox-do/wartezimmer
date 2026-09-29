import assert from 'node:assert/strict';
import test from 'node:test';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import { serializeManagerApiErrors, restoreManagerApiErrors } from './manager-api-bridge.js';
import { unwrapSetupApiResponse } from './ipc-channels.js';
import type { PraxisManagerApi } from './praxis-manager-api.js';

test('contextBridge transports plain rejection data and renderer reconstructs the Error', async () => {
  const error = {
    code: 'tls_check_failed',
    category: 'operation-failed' as const,
    message: 'Prüfung fehlgeschlagen',
    retryable: false,
    detail: 'PEM prüfen',
    phase: 'check',
  };
  const preload = serializeManagerApiErrors({
    hostPlatform: 'darwin',
    checkHostTlsCertificate: async () => unwrapSetupApiResponse({ ok: false, error }),
  } as PraxisManagerApi);
  const bridge = {
    ...preload,
    checkHostTlsCertificate: async () => {
      try {
        return await preload.checkHostTlsCertificate();
      } catch (rejection) {
        assert.equal(rejection instanceof Error, false);
        throw structuredClone(rejection);
      }
    },
  };
  const renderer = restoreManagerApiErrors(bridge);
  assert.equal(renderer.hostPlatform, 'darwin');
  await assert.rejects(renderer.checkHostTlsCertificate(), (received: unknown) => {
    assert.ok(received instanceof ManagerApiError);
    assert.deepEqual(received.toJSON(), error);
    return true;
  });
});
