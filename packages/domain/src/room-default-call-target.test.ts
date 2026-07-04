import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureSingleDefaultCallTarget,
  listEnabledRooms,
  resolveDefaultCallRoomId,
} from './room-default-call-target.js';

const rooms = [
  { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
  { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: false },
];

test('ensureSingleDefaultCallTarget keeps preferred room and clears others', () => {
  const next = ensureSingleDefaultCallTarget(rooms, 'labor');
  assert.equal(next.find((room) => room.roomId === 'labor')?.defaultCallTarget, true);
  assert.equal(next.find((room) => room.roomId === 'empfang')?.defaultCallTarget, false);
});

test('ensureSingleDefaultCallTarget falls back to first enabled room when none marked', () => {
  const next = ensureSingleDefaultCallTarget([
    { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: false },
    { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: false },
  ]);

  assert.equal(next[0]?.defaultCallTarget, true);
  assert.equal(next[1]?.defaultCallTarget, false);
});

test('listEnabledRooms ignores disabled and blank ids', () => {
  const enabled = listEnabledRooms([
    { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
    { roomId: ' ', roomLabel: 'X', enabled: true, defaultCallTarget: false },
    { roomId: 'labor', roomLabel: 'Labor', enabled: false, defaultCallTarget: false },
  ]);
  assert.deepEqual(
    enabled.map((room) => room.roomId),
    ['empfang'],
  );
});

test('resolveDefaultCallRoomId returns marked default or first enabled room', () => {
  assert.equal(resolveDefaultCallRoomId(rooms), 'empfang');
  assert.equal(
    resolveDefaultCallRoomId([
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: false },
      { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: false },
    ]),
    'empfang',
  );
});
