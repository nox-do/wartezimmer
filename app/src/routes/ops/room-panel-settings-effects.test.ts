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
  const revoked: string[] = [];
  let published = 0;

  applyRoomPanelSettingsEffects({
    previous: settings({
      inside: { enabled: true, mode: 'display_only', showPatientNames: true },
    }),
    updated: settings({
      inside: { enabled: true, mode: 'staff_full', showPatientNames: true },
    }),
    sessions: { revokeRoomPanelSessions: (roomId) => void revoked.push(roomId) },
    publishQueueUpdate: () => {
      published += 1;
    },
  });

  assert.deepEqual(revoked, []);
  assert.equal(published, 1);
});

test('disabling inside panel revokes existing sessions before publishing', () => {
  const events: string[] = [];
  applyRoomPanelSettingsEffects({
    previous: settings({
      inside: { enabled: true, mode: 'staff_full', showPatientNames: true },
    }),
    updated: settings({
      inside: { enabled: false, mode: 'staff_full', showPatientNames: true },
    }),
    sessions: {
      revokeRoomPanelSessions: (roomId) => void events.push(`revoke:${roomId}`),
    },
    publishQueueUpdate: () => void events.push('publish'),
  });
  assert.deepEqual(events, ['revoke:labor', 'publish']);
});

test('disabling outside panel revokes existing sessions before publishing', () => {
  const events: string[] = [];
  applyRoomPanelSettingsEffects({
    previous: settings({
      outside: { enabled: true, mode: 'arrival' },
    }),
    updated: settings({
      outside: { enabled: false, mode: 'arrival' },
    }),
    sessions: {
      revokeRoomPanelSessions: (roomId) => void events.push(`revoke:${roomId}`),
    },
    publishQueueUpdate: () => void events.push('publish'),
  });
  assert.deepEqual(events, ['revoke:labor', 'publish']);
});
