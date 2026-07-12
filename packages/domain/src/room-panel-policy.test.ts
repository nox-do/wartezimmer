import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveRoomPanelCapabilities,
  roomPanelCanCall,
  roomPanelVisitTargetsRoom,
  roomPanelRequiresPin,
} from './room-panel-policy.js';

test('roomPanelRequiresPin: inside yes, outside no', () => {
  assert.equal(roomPanelRequiresPin('inside'), true);
  assert.equal(roomPanelRequiresPin('outside'), false);
});

test('roomPanelCanCall: inside + allowCalling only', () => {
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

test('roomPanelVisitTargetsRoom: any status when target room matches', () => {
  const room = 'labor';
  assert.equal(
    roomPanelVisitTargetsRoom(
      { status: 'waiting', movementMode: 'call', destinationRoomId: room },
      room,
    ),
    true,
  );
  assert.equal(
    roomPanelVisitTargetsRoom(
      { status: 'called', movementMode: 'call', roomId: room },
      room,
    ),
    true,
  );
  assert.equal(
    roomPanelVisitTargetsRoom(
      { status: 'directed', movementMode: 'self_go', destinationRoomId: room },
      room,
    ),
    true,
  );
  assert.equal(
    roomPanelVisitTargetsRoom(
      { status: 'waiting', movementMode: 'call', targetLocationId: room },
      room,
    ),
    true,
  );
  assert.equal(
    roomPanelVisitTargetsRoom(
      { status: 'waiting', movementMode: 'call', destinationRoomId: 'empfang' },
      room,
    ),
    false,
  );
});
