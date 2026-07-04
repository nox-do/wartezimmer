import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countRoomOccupants,
  countRoomOccupantsExcluding,
  isRoomOccupyingStatus,
  normalizeMaxOccupancy,
  parseMaxOccupancy,
  resolveRoomMaxOccupancy,
  roomHasCapacity,
} from './room-capacity.js';

const rooms = [
  { roomId: 'behandlung', maxOccupancy: 1 },
  { roomId: 'labor', maxOccupancy: null },
];

const occupants = [
  { occupantId: 't1', roomId: 'behandlung', status: 'called' },
  { occupantId: 't2', roomId: 'labor', status: 'in_room' },
  { occupantId: 't3', roomId: 'behandlung', status: 'waiting' },
];

test('isRoomOccupyingStatus accepts called and in_room only', () => {
  assert.equal(isRoomOccupyingStatus('called'), true);
  assert.equal(isRoomOccupyingStatus('in_room'), true);
  assert.equal(isRoomOccupyingStatus('waiting'), false);
});

test('normalizeMaxOccupancy treats invalid values as unlimited', () => {
  assert.equal(normalizeMaxOccupancy(null), null);
  assert.equal(normalizeMaxOccupancy(undefined), null);
  assert.equal(normalizeMaxOccupancy(0), null);
  assert.equal(normalizeMaxOccupancy(3), 3);
});

test('parseMaxOccupancy accepts only positive integers', () => {
  assert.equal(parseMaxOccupancy(null), null);
  assert.equal(parseMaxOccupancy('2'), null);
  assert.equal(parseMaxOccupancy(2), 2);
});

test('resolveRoomMaxOccupancy returns null for unknown rooms', () => {
  assert.equal(resolveRoomMaxOccupancy(rooms, 'unknown'), null);
  assert.equal(resolveRoomMaxOccupancy(rooms, 'behandlung'), 1);
});

test('countRoomOccupants ignores waiting and excluded occupant', () => {
  assert.equal(countRoomOccupants(occupants, 'behandlung'), 1);
  assert.equal(countRoomOccupantsExcluding(occupants, 'behandlung', 't1'), 0);
  assert.equal(countRoomOccupants(occupants, 'labor'), 1);
});

test('roomHasCapacity respects maxOccupancy and unlimited rooms', () => {
  assert.equal(roomHasCapacity(rooms, occupants, 'behandlung'), false);
  assert.equal(roomHasCapacity(rooms, occupants, 'behandlung', 't1'), true);
  assert.equal(roomHasCapacity(rooms, occupants, 'labor'), true);
  assert.equal(roomHasCapacity(rooms, occupants, 'unknown'), true);
});
