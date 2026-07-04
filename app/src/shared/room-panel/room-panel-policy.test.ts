import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoreDatabase } from '../db/database.js';
import {
  resolveRoomPanelForSession,
  roomPanelCanCheckIn,
  roomPanelCanCheckOut,
  roomPanelMayShowPatientNames,
} from './room-panel-policy.js';

const outsidePanel = {
  enabled: true,
  placement: 'outside' as const,
  mode: 'arrival' as const,
  showPatientNames: true,
  calledTextPreset: 'please_enter' as const,
  calledTextCustom: null,
  arrivedTextPreset: 'please_wait_here' as const,
  arrivedTextCustom: null,
};

test('outside placement is a hard privacy boundary', () => {
  assert.equal(roomPanelMayShowPatientNames(outsidePanel), false);
});

test('arrival and staff modes have distinct capabilities', () => {
  assert.equal(roomPanelCanCheckIn({ placement: 'outside', mode: 'display_only' }), false);
  assert.equal(roomPanelCanCheckIn({ placement: 'outside', mode: 'arrival' }), true);
  assert.equal(roomPanelCanCheckOut({ placement: 'outside', mode: 'staff_full' }), false);
  assert.equal(roomPanelCanCheckOut({ placement: 'inside', mode: 'staff_full' }), true);
});

test('session placement must still match current settings', () => {
  const db = {
    getOpsSettings: () => ({
      rooms: [
        {
          roomId: 'labor',
          roomLabel: 'Labor',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panel: outsidePanel,
        },
      ],
    }),
  } as unknown as CoreDatabase;

  assert.ok(resolveRoomPanelForSession(db, { roomId: 'labor', placement: 'outside' }));
  assert.equal(resolveRoomPanelForSession(db, { roomId: 'labor', placement: 'inside' }), null);
});
