import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import type { PortCheckRequest } from '@wartezimmer/server-shared/setup-api';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';

test('TLS drafts bypass the port dialog and retrying a restore waits for confirmation', async (t) => {
  // This controller test observes the state directly, without mounting a Svelte component.
  Object.defineProperty(globalThis, '$state', {
    configurable: true,
    value: (state: unknown) => state,
  });
  t.after(() => {
    Reflect.deleteProperty(globalThis, '$state');
  });
  const { withPortGuide, portGuide, closePortGuide, retryPortGuide } =
    await import('./port-check-guide.svelte.js');
  const checks: PortCheckRequest[] = [];
  const operations: string[] = [];
  let occupied = true;
  const api = withPortGuide({
    checkPorts: async (request: PortCheckRequest) => {
      checks.push(request);
      return {
        id: String(checks.length),
        at: new Date().toISOString(),
        rows: [],
        error: occupied ? { kind: 'occupied', message: 'Port belegt' } : undefined,
      };
    },
    prepareHostTls: async () => {
      operations.push('prepare');
    },
    resetHostTls: async () => {
      operations.push('reset');
    },
    restorePfbackup: async (content: string) => {
      operations.push(content);
    },
  } as unknown as WartezimmerManagerApi);

  const tls = { mode: 'managed', lanIp: '192.168.0.100' } as const;
  await api.prepareHostTls({ ...tls, existingOnly: true });
  await api.resetHostTls({ discardPreparationOnly: true });
  assert.deepEqual(checks, []);
  assert.equal(portGuide.open, false);
  assert.deepEqual(operations, ['prepare', 'reset']);

  for (const run of [() => api.prepareHostTls(tls), () => api.resetHostTls()]) {
    const result = run();
    await nextTurn();
    assert.equal(portGuide.open, true);
    closePortGuide();
    await assert.rejects(result, { name: 'PortCheckCancelled' });
  }
  const restore = api.restorePfbackup('selected-backup');
  await nextTurn();
  closePortGuide(true);
  assert.equal(portGuide.open, true);
  occupied = false;
  await retryPortGuide();
  assert.equal(portGuide.open, true);
  assert.deepEqual(checks, [
    { kind: 'tls-prepare' },
    { kind: 'current' },
    { kind: 'restore', content: 'selected-backup' },
    { kind: 'restore', content: 'selected-backup' },
  ]);
  assert.deepEqual(operations, ['prepare', 'reset']);
  closePortGuide(true);
  await restore;
  assert.deepEqual(operations, ['prepare', 'reset', 'selected-backup']);
});
