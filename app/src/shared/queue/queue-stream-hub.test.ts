import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoreDatabase } from '../db/database.js';
import {
  publishTvQueueUpdate,
  subscribeQueueStream,
  subscribeRoomPanelQueueStream,
} from './queue-stream-hub.js';

function fakeDb(): CoreDatabase {
  return {
    listQueue: () => [],
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
    getOpsSettings: () => ({ rooms: [] }),
    getFlowCoreRuntimeInstance: () =>
      ({
        catalog: () => ({ surfaces: [], surfaceDisplayRules: [] }),
        visits: () => [],
      }) as unknown as ReturnType<
        import('../flow-core/flow-core-runtime.js').getFlowCoreRuntime
      >,
  } as unknown as CoreDatabase;
}

test('an invalid room-panel listener cannot abort queue publication', () => {
  let tvUpdates = 0;
  const unsubscribeTv = subscribeQueueStream(() => {
    tvUpdates += 1;
  });
  const unsubscribePanel = subscribeRoomPanelQueueStream(
    { roomId: 'removed-room', placement: 'outside' },
    () => undefined,
  );

  assert.doesNotThrow(() => publishTvQueueUpdate(fakeDb()));
  assert.equal(tvUpdates, 1);

  unsubscribePanel();
  unsubscribeTv();
});

test('a throwing listener is isolated and removed from later publications', () => {
  let calls = 0;
  const unsubscribe = subscribeQueueStream(() => {
    calls += 1;
    throw new Error('disconnected');
  });

  publishTvQueueUpdate(fakeDb());
  publishTvQueueUpdate(fakeDb());
  assert.equal(calls, 1);

  unsubscribe();
});
