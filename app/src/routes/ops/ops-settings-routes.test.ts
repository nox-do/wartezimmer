import assert from 'node:assert/strict';
import test from 'node:test';
import { createSerializedExecutor } from './ops-settings-routes.js';

test('settings updates execute sequentially even while an earlier update awaits', async () => {
  const serialize = createSerializedExecutor();
  const order: string[] = [];
  let releaseFirst: () => void = () => undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = serialize(async () => {
    order.push('first:start');
    await firstGate;
    order.push('first:end');
  });
  const second = serialize(async () => {
    order.push('second:start');
  });

  await Promise.resolve();
  assert.deepEqual(order, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start']);
});

test('a failed settings update does not block the next update', async () => {
  const serialize = createSerializedExecutor();
  const failed = serialize(async () => {
    throw new Error('expected');
  });
  const next = serialize(async () => 'completed');

  await assert.rejects(failed, /expected/);
  assert.equal(await next, 'completed');
});
