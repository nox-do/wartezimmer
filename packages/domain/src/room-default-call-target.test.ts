import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureSingleDefaultCallTarget,
  listEnabledRooms,
  resolveDefaultCallRoomId,
  WAITING_ROOM_LOCATION_ID,
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

test('ensureSingleDefaultCallTarget keeps all rooms unmarked for a waiting-room default', () => {
  const next = ensureSingleDefaultCallTarget([
    { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: false },
    { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: false },
  ]);

  assert.equal(next[0]?.defaultCallTarget, false);
  assert.equal(next[1]?.defaultCallTarget, false);
});

test('ensureSingleDefaultCallTarget clears room defaults when waiting room is preferred', () => {
  const next = ensureSingleDefaultCallTarget(rooms, WAITING_ROOM_LOCATION_ID);
  assert.equal(
    next.some((room) => room.defaultCallTarget),
    false,
  );
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

test('resolveDefaultCallRoomId returns marked room or the waiting room', () => {
  assert.equal(resolveDefaultCallRoomId(rooms), 'empfang');
  assert.equal(
    resolveDefaultCallRoomId([
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: false },
      { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: false },
    ]),
    WAITING_ROOM_LOCATION_ID,
  );
});

test('legacy waiting pseudo-room is excluded from practice-room lists', () => {
  const withWaiting = [
    { roomId: 'pf_waiting', roomLabel: 'Wartezimmer', enabled: true, defaultCallTarget: false },
    ...rooms.map((room) => ({ ...room, defaultCallTarget: false })),
  ];
  assert.equal(resolveDefaultCallRoomId(withWaiting), WAITING_ROOM_LOCATION_ID);
  assert.deepEqual(
    listEnabledRooms(withWaiting).map((room) => room.roomId),
    ['empfang', 'labor'],
  );
});
