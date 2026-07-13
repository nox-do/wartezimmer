import assert from 'node:assert/strict';
import test from 'node:test';
import {
  roomPanelDeviceId,
  TERMINAL_DEVICE_ID,
  WAITING_ROOM_DEVICE_ID,
} from './device-ids.js';

test('device id constants', () => {
  assert.equal(WAITING_ROOM_DEVICE_ID, 'waiting-room');
  assert.equal(TERMINAL_DEVICE_ID, 'checkin-terminal');
});

test('roomPanelDeviceId', () => {
  assert.equal(roomPanelDeviceId('raum-1', 'outside'), 'room-panel:raum-1:outside');
  assert.equal(roomPanelDeviceId('raum-1', 'inside'), 'room-panel:raum-1:inside');
});
