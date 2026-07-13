import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveRoomPanelCapabilities,
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

test('visitTargetsRoom matches Flow-Core targetLocationId only', () => {
  const room = 'labor';
  assert.equal(visitTargetsRoom({ targetLocationId: room }, room), true);
  assert.equal(visitTargetsRoom({ targetLocationId: 'empfang' }, room), false);
  assert.equal(visitTargetsRoom({ targetLocationId: null }, room), false);
  assert.equal(visitTargetsRoom({ targetLocationId: room }, ''), false);
  assert.equal(visitTargetsRoom({ targetLocationId: ` ${room} ` }, room), true);
});
