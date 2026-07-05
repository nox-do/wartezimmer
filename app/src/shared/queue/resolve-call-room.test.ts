import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCallRoomForVisit } from './resolve-call-room.js';

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

test('resolveCallRoomForVisit uses ticket destination snapshot when body is empty', () => {
  assert.deepEqual(
    resolveCallRoomForVisit(settings, undefined, undefined, {
      roomId: 'labor',
      roomLabel: 'Labor',
    }),
    { roomId: 'labor', roomLabel: 'Labor' },
  );
});

test('resolveCallRoomForVisit uses explicit room from client when provided', () => {
  assert.deepEqual(resolveCallRoomForVisit(settings, 'labor', 'Labor'), {
    roomId: 'labor',
    roomLabel: 'Labor',
  });
});

test('resolveCallRoomForVisit returns null without snapshot or explicit body', () => {
  assert.equal(resolveCallRoomForVisit(settings), null);
});
