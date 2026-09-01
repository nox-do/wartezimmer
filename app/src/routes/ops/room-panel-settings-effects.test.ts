import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRoomPanelsSettings } from '@praxis-flow/domain';
import type { OpsSettings } from '../../shared/db/db-types.js';
import { applyRoomPanelSettingsEffects } from './room-panel-settings-effects.js';

function settings(panels: Parameters<typeof normalizeRoomPanelsSettings>[0]) {
  return {
    rooms: [
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        enabled: true,
        defaultCallTarget: true,
        maxOccupancy: null,
        panels: normalizeRoomPanelsSettings(panels),
      },
    ],
  } satisfies Pick<OpsSettings, 'rooms'>;
}

test('mode changes publish live without revoking placement session', () => {
  const revoked: Array<{ roomId: string; placement: string }> = [];
  let published = 0;

  applyRoomPanelSettingsEffects({
    previous: settings({
      inside: { enabled: true, mode: 'display_only', showPatientNames: true },
    }),
    updated: settings({
      inside: { enabled: true, mode: 'staff_full', showPatientNames: true },
    }),
    grants: {
      revokeRoomPanelAuthorizationsByRoom: () => 0,
      revokeRoomPanelAuthorizationsByPlacement: (roomId, placement) => {
        revoked.push({ roomId, placement });
        return 0;
      },
    },
    publishQueueUpdate: () => {
      published += 1;
    },
  });

  assert.deepEqual(revoked, []);
  assert.equal(published, 1);
});

test('disabling inside panel revokes only inside sessions before publishing', () => {
  const events: string[] = [];
  applyRoomPanelSettingsEffects({
    previous: settings({
      outside: { enabled: true, mode: 'arrival' },
      inside: { enabled: true, mode: 'staff_full', showPatientNames: true },
    }),
    updated: settings({
      outside: { enabled: true, mode: 'arrival' },
      inside: { enabled: false, mode: 'staff_full', showPatientNames: true },
    }),
    grants: {
      revokeRoomPanelAuthorizationsByRoom: (roomId) => {
        events.push(`revoke-all:${roomId}`);
        return 0;
      },
      revokeRoomPanelAuthorizationsByPlacement: (roomId, placement) => {
        events.push(`revoke:${roomId}:${placement}`);
        return 0;
      },
    },
    publishQueueUpdate: () => void events.push('publish'),
  });
  assert.deepEqual(events, ['revoke:labor:inside', 'publish']);
});

test('disabling outside panel revokes only outside sessions before publishing', () => {
  const events: string[] = [];
  applyRoomPanelSettingsEffects({
    previous: settings({
      outside: { enabled: true, mode: 'arrival' },
    }),
    updated: settings({
      outside: { enabled: false, mode: 'arrival' },
    }),
    grants: {
      revokeRoomPanelAuthorizationsByRoom: (roomId) => {
        events.push(`revoke-all:${roomId}`);
        return 0;
      },
      revokeRoomPanelAuthorizationsByPlacement: (roomId, placement) => {
        events.push(`revoke:${roomId}:${placement}`);
        return 0;
      },
    },
    publishQueueUpdate: () => void events.push('publish'),
  });
  assert.deepEqual(events, ['revoke:labor:outside', 'publish']);
});
