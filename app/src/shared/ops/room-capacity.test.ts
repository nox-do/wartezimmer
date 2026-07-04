import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import {
  assertRoomHasCapacity,
  roomHasCapacity,
  ROOM_AT_CAPACITY,
  validateRoomCapacitySettingsChange,
} from './room-capacity.js';

const rooms = [
  {
    roomId: 'behandlung',
    roomLabel: 'Behandlung',
    enabled: true,
    defaultCallTarget: true,
    maxOccupancy: 1,
  },
  {
    roomId: 'labor',
    roomLabel: 'Labor',
    enabled: true,
    defaultCallTarget: false,
    maxOccupancy: null,
  },
];

const tickets = [
  { id: 't1', laneCode: 'A', number: 1, roomId: 'behandlung', status: 'called' as const },
  { id: 't2', laneCode: 'L', number: 2, roomId: 'labor', status: 'in_room' as const },
  { id: 't3', laneCode: 'O', number: 3, roomId: 'behandlung', status: 'waiting' as const },
];

test('roomHasCapacity adapter maps ticket ids to domain occupants', () => {
  assert.equal(roomHasCapacity({ rooms }, tickets, 'behandlung'), false);
  assert.equal(roomHasCapacity({ rooms }, tickets, 'behandlung', 't1'), true);
});

test('assertRoomHasCapacity throws ROOM_AT_CAPACITY', () => {
  assert.throws(
    () => assertRoomHasCapacity({ rooms }, tickets, 'behandlung'),
    (error: unknown) => error instanceof DomainError && error.domainCode === ROOM_AT_CAPACITY,
  );
  assert.doesNotThrow(() => assertRoomHasCapacity({ rooms }, tickets, 'behandlung', 't1'));
});

test('validateRoomCapacitySettingsChange treats invalid maxOccupancy as unlimited', () => {
  const result = validateRoomCapacitySettingsChange({
    nextRooms: [{ ...rooms[0]!, maxOccupancy: 0 }],
    queueTickets: [
      { laneCode: 'A', number: 1, roomId: 'behandlung', status: 'called' },
      { laneCode: 'A', number: 2, roomId: 'behandlung', status: 'in_room' },
    ],
  });

  assert.equal(result.ok, true);
});

test('validateRoomCapacitySettingsChange blocks when max below occupancy', () => {
  const result = validateRoomCapacitySettingsChange({
    nextRooms: [{ ...rooms[0]!, maxOccupancy: 1 }],
    queueTickets: [
      { laneCode: 'A', number: 1, roomId: 'behandlung', status: 'called' },
      { laneCode: 'A', number: 2, roomId: 'behandlung', status: 'in_room' },
    ],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.details.tickets, /A-001/);
    assert.match(result.details.tickets, /A-002/);
  }
});
