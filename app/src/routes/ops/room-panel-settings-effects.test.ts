import assert from 'node:assert/strict';
import test from 'node:test';
import type { OpsSettings, RoomPanelMode, RoomPanelPlacement } from '../../shared/db/db-types.js';
import { applyRoomPanelSettingsEffects } from './room-panel-settings-effects.js';

function settings(placement: RoomPanelPlacement, mode: RoomPanelMode, enabled = true) {
  return {
    rooms: [
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        enabled: true,
        defaultCallTarget: true,
        maxOccupancy: null,
        panel: {
          enabled,
          placement,
          mode,
          showPatientNames: placement === 'inside',
          calledTextPreset: 'please_enter' as const,
          calledTextCustom: null,
          arrivedTextPreset: 'please_wait_here' as const,
          arrivedTextCustom: null,
        },
      },
    ],
  } satisfies Pick<OpsSettings, 'rooms'>;
}

test('mode changes publish live without revoking the placement session', () => {
  const revoked: string[] = [];
  let published = 0;

  applyRoomPanelSettingsEffects({
    previous: settings('inside', 'display_only'),
    updated: settings('inside', 'staff_full'),
    sessions: { revokeRoomPanelSessions: (roomId) => void revoked.push(roomId) },
    publishQueueUpdate: () => {
      published += 1;
    },
  });

  assert.deepEqual(revoked, []);
  assert.equal(published, 1);
});

test('placement changes and panel deactivation revoke existing sessions before publishing', () => {
  for (const updated of [settings('outside', 'arrival'), settings('inside', 'staff_full', false)]) {
    const events: string[] = [];
    applyRoomPanelSettingsEffects({
      previous: settings('inside', 'staff_full'),
      updated,
      sessions: {
        revokeRoomPanelSessions: (roomId) => void events.push(`revoke:${roomId}`),
      },
      publishQueueUpdate: () => void events.push('publish'),
    });
    assert.deepEqual(events, ['revoke:labor', 'publish']);
  }
});
