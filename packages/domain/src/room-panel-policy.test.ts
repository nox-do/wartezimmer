import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveRoomPanelCapabilities,
  resolveVisitTargetRoomId,
  roomPanelCanCall,
  roomPanelRequiresPin,
  visitTargetsRoom,
} from './room-panel-policy.js';

test('roomPanelRequiresPin: inside yes, outside no', () => {
  assert.equal(roomPanelRequiresPin('inside'), true);
  assert.equal(roomPanelRequiresPin('outside'), false);
});

test('roomPanelCanCall: inside staff_full + allowCalling only', () => {
  assert.equal(
    roomPanelCanCall({
      placement: 'inside',
      mode: 'staff_full',
      enabled: true,
      allowCalling: true,
    }),
    true,
  );
  assert.equal(
    roomPanelCanCall({
      placement: 'inside',
      mode: 'arrival',
      enabled: true,
      allowCalling: true,
    }),
    false,
  );
  assert.equal(
    roomPanelCanCall({
      placement: 'inside',
      mode: 'staff_full',
      enabled: true,
      allowCalling: false,
    }),
    false,
  );
  assert.equal(
    roomPanelCanCall({
      placement: 'outside',
      mode: 'arrival',
      enabled: true,
      allowCalling: true,
    }),
    false,
  );
});

test('resolveRoomPanelCapabilities bundles placement rules', () => {
  assert.deepEqual(
    resolveRoomPanelCapabilities({
      placement: 'inside',
      mode: 'staff_full',
      enabled: true,
      showPatientNames: true,
      allowCalling: true,
    }),
    {
      requiresPin: true,
      canCheckIn: true,
      canCheckOut: true,
      mayShowPatientNames: true,
      canCall: true,
    },
  );
  assert.deepEqual(
    resolveRoomPanelCapabilities({
      placement: 'outside',
      mode: 'arrival',
      enabled: true,
      showPatientNames: true,
      allowCalling: true,
    }),
    {
      requiresPin: false,
      canCheckIn: true,
      canCheckOut: false,
      mayShowPatientNames: false,
      canCall: false,
    },
  );
});

test('resolveRoomPanelCapabilities disables actions when panel is off', () => {
  assert.deepEqual(
    resolveRoomPanelCapabilities({
      placement: 'inside',
      mode: 'staff_full',
      enabled: false,
      showPatientNames: true,
      allowCalling: true,
    }),
    {
      requiresPin: true,
      canCheckIn: false,
      canCheckOut: false,
      mayShowPatientNames: false,
      canCall: false,
    },
  );
  assert.deepEqual(
    resolveRoomPanelCapabilities({
      placement: 'outside',
      mode: 'arrival',
      enabled: false,
    }),
    {
      requiresPin: false,
      canCheckIn: false,
      canCheckOut: false,
      mayShowPatientNames: false,
      canCall: false,
    },
  );
});

test('resolveVisitTargetRoomId: waiting/directed use destination fields', () => {
  assert.equal(
    resolveVisitTargetRoomId({
      status: 'waiting',
      destinationRoomId: 'labor',
      roomId: 'empfang',
    }),
    'labor',
  );
  assert.equal(
    resolveVisitTargetRoomId({
      status: 'directed',
      targetLocationId: 'labor',
      roomId: 'empfang',
    }),
    'labor',
  );
  assert.equal(
    resolveVisitTargetRoomId({
      status: 'waiting',
      roomId: 'empfang',
    }),
    null,
  );
});

test('resolveVisitTargetRoomId: called/in_room prefer roomId', () => {
  assert.equal(
    resolveVisitTargetRoomId({
      status: 'called',
      roomId: 'labor',
      destinationRoomId: 'empfang',
    }),
    'labor',
  );
  assert.equal(
    resolveVisitTargetRoomId({
      status: 'in_room',
      roomId: 'labor',
      targetLocationId: 'empfang',
    }),
    'labor',
  );
  assert.equal(
    resolveVisitTargetRoomId({
      status: 'called',
      destinationRoomId: 'empfang',
    }),
    'empfang',
  );
});

test('visitTargetsRoom matches session room against resolved target', () => {
  const room = 'labor';
  assert.equal(
    visitTargetsRoom(
      { status: 'waiting', movementMode: 'call', destinationRoomId: room },
      room,
    ),
    true,
  );
  assert.equal(
    visitTargetsRoom({ status: 'called', movementMode: 'call', roomId: room }, room),
    true,
  );
  assert.equal(
    visitTargetsRoom(
      { status: 'directed', movementMode: 'self_go', destinationRoomId: room },
      room,
    ),
    true,
  );
  assert.equal(
    visitTargetsRoom(
      { status: 'waiting', movementMode: 'call', targetLocationId: room },
      room,
    ),
    true,
  );
  assert.equal(
    visitTargetsRoom(
      { status: 'called', movementMode: 'call', roomId: 'empfang', destinationRoomId: room },
      room,
    ),
    false,
  );
  assert.equal(
    visitTargetsRoom(
      { status: 'waiting', movementMode: 'call', destinationRoomId: 'empfang' },
      room,
    ),
    false,
  );
});
