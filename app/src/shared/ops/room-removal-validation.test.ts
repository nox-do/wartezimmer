import assert from 'node:assert/strict';
import test from 'node:test';
import {
  disabledRoomIds,
  removedRoomIds,
  ROOM_BLOCKED_CAPACITY,
  ROOM_BLOCKED_QUEUE,
  ROOM_BLOCKED_TOPICS,
  validateRoomSettingsChange,
} from './room-removal-validation.js';

const baseRooms = [
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
];

test('removedRoomIds lists ids missing from next rooms', () => {
  assert.deepEqual(removedRoomIds(baseRooms, [baseRooms[0]!]), ['labor']);
});

test('disabledRoomIds lists rooms switched to inactive', () => {
  assert.deepEqual(
    disabledRoomIds(baseRooms, [baseRooms[0]!, { ...baseRooms[1]!, enabled: false }]),
    ['labor'],
  );
});

test('validateRoomSettingsChange blocks removed room referenced by topics', () => {
  const result = validateRoomSettingsChange({
    currentRooms: baseRooms,
    nextRooms: [baseRooms[0]!],
    topics: [
      {
        topicId: 'offen',
        label: 'Offen',
        laneCode: 'O',
        defaultRoomId: 'labor',
        iconId: null,
        accentColor: '#000000',
        enabled: true,
        availableFrom: null,
        availableTo: null,
        sortOrder: 1,
      },
    ],
    queueTickets: [],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, ROOM_BLOCKED_TOPICS);
    assert.equal(result.details.topics, 'Offen');
  }
});

test('validateRoomSettingsChange blocks removed room with queue tickets', () => {
  const result = validateRoomSettingsChange({
    currentRooms: baseRooms,
    nextRooms: [baseRooms[0]!],
    topics: [
      {
        topicId: 'offen',
        label: 'Offen',
        laneCode: 'O',
        defaultRoomId: 'empfang',
        iconId: null,
        accentColor: '#000000',
        enabled: true,
        availableFrom: null,
        availableTo: null,
        sortOrder: 1,
      },
    ],
    queueTickets: [{ laneCode: 'O', number: 7, roomId: 'labor', status: 'called' }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, ROOM_BLOCKED_QUEUE);
    assert.equal(result.details.tickets, 'O-007');
  }
});

test('validateRoomSettingsChange blocks disabled room with queue tickets', () => {
  const result = validateRoomSettingsChange({
    currentRooms: baseRooms,
    nextRooms: [baseRooms[0]!, { ...baseRooms[1]!, enabled: false }],
    topics: [
      {
        topicId: 'offen',
        label: 'Offen',
        laneCode: 'O',
        defaultRoomId: 'empfang',
        iconId: null,
        accentColor: '#000000',
        enabled: true,
        availableFrom: null,
        availableTo: null,
        sortOrder: 1,
      },
    ],
    queueTickets: [{ laneCode: 'L', number: 3, roomId: 'labor', status: 'in_room' }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, ROOM_BLOCKED_QUEUE);
    assert.equal(result.details.tickets, 'L-003');
  }
});

test('validateRoomSettingsChange blocks renaming a room with assigned absent tickets', () => {
  const result = validateRoomSettingsChange({
    currentRooms: baseRooms,
    nextRooms: [baseRooms[0]!, { ...baseRooms[1]!, roomLabel: 'Neues Labor' }],
    topics: [],
    queueTickets: [
      {
        laneCode: 'L',
        number: 4,
        roomId: null,
        destinationRoomId: 'labor',
        status: 'absent_return_later',
      },
    ],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, ROOM_BLOCKED_QUEUE);
    assert.equal(result.details.tickets, 'L-004');
  }
});

test('validateRoomSettingsChange blocks when maxOccupancy is below current occupancy', () => {
  const result = validateRoomSettingsChange({
    currentRooms: baseRooms,
    nextRooms: [baseRooms[0]!, { ...baseRooms[1]!, maxOccupancy: 1 }],
    topics: [
      {
        topicId: 'offen',
        label: 'Offen',
        laneCode: 'O',
        defaultRoomId: 'empfang',
        iconId: null,
        accentColor: '#000000',
        enabled: true,
        availableFrom: null,
        availableTo: null,
        sortOrder: 1,
      },
    ],
    queueTickets: [
      { laneCode: 'L', number: 1, roomId: 'labor', status: 'called' },
      { laneCode: 'L', number: 2, roomId: 'labor', status: 'in_room' },
    ],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, ROOM_BLOCKED_CAPACITY);
  }
});
