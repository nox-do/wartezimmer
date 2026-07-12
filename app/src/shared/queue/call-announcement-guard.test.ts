import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import {
  markDeviceStreamConnected,
  markDeviceStreamDisconnected,
  resetDevicePresenceForTests,
} from '../ops/device-presence-registry.js';
import { WAITING_ROOM_DEVICE_ID } from '../ops/device-ids.js';
import {
  assertQueueCallAnnouncementReachable,
  isAnnouncementDeviceReachable,
  isQueueCallAnnouncementReachable,
} from './call-announcement-guard.js';

test('queue call requires waiting-room display online with open stream', () => {
  resetDevicePresenceForTests();

  assert.equal(isAnnouncementDeviceReachable(WAITING_ROOM_DEVICE_ID), false);
  assert.equal(isQueueCallAnnouncementReachable(), false);

  assert.throws(
    () => assertQueueCallAnnouncementReachable(),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.domainCode, 'CALL_ANNOUNCEMENT_OFFLINE');
      return true;
    },
  );

  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });
  assert.equal(isAnnouncementDeviceReachable(WAITING_ROOM_DEVICE_ID), true);
  assert.equal(isQueueCallAnnouncementReachable(), true);
  assert.doesNotThrow(() => assertQueueCallAnnouncementReachable());

  markDeviceStreamDisconnected(WAITING_ROOM_DEVICE_ID);
  assert.equal(isAnnouncementDeviceReachable(WAITING_ROOM_DEVICE_ID), false);
  assert.equal(isQueueCallAnnouncementReachable(), false);
});
