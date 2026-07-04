import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCallRoomForTicket } from './resolve-call-room.js';

const settings = {
  rooms: [
    {
      roomId: 'empfang',
      roomLabel: 'Empfang',
      enabled: true,
      defaultCallTarget: true,
      maxOccupancy: null,
    },
    {
      roomId: 'labor',
      roomLabel: 'Labor',
      enabled: true,
      defaultCallTarget: false,
      maxOccupancy: null,
    },
  ],
};

test('resolveCallRoomForTicket uses ticket destination snapshot when body is empty', () => {
  assert.deepEqual(
    resolveCallRoomForTicket(settings, undefined, undefined, {
      roomId: 'labor',
      roomLabel: 'Labor',
    }),
    { roomId: 'labor', roomLabel: 'Labor' },
  );
});

test('resolveCallRoomForTicket uses explicit room from client when provided', () => {
  assert.deepEqual(resolveCallRoomForTicket(settings, 'labor', 'Labor'), {
    roomId: 'labor',
    roomLabel: 'Labor',
  });
});

test('resolveCallRoomForTicket returns null without snapshot or explicit body', () => {
  assert.equal(resolveCallRoomForTicket(settings), null);
});
