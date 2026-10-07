import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRoomPanelsSettings } from '@wartezimmer/domain';
import type { CoreDatabase } from '../db/database.js';
import { resolveRoomPanelForSession } from './room-panel-policy.js';

const outsidePanel = {
  enabled: true,
  mode: 'arrival' as const,
  showPatientNames: true,
  allowCalling: false,
  calledTextPreset: 'please_enter' as const,
  calledTextCustom: null,
  arrivedTextPreset: 'please_wait_here' as const,
  arrivedTextCustom: null,
};

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
          panels: normalizeRoomPanelsSettings({ outside: outsidePanel }),
        },
      ],
    }),
  } as unknown as CoreDatabase;

  assert.ok(resolveRoomPanelForSession(db, { roomId: 'labor', placement: 'outside' }));
  assert.equal(resolveRoomPanelForSession(db, { roomId: 'labor', placement: 'inside' }), null);
});
