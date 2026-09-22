import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveDestinationRoomForTopic,
  resolveCheckInDestinationRoomLabel,
} from './checkin-topic-settings.js';

const settings = {
  topics: [
    {
      topicId: 'blut',
      label: 'Blutabnahme',
      laneCode: 'L',
      defaultRoomId: 'labor',
      iconId: null,
      accentColor: '#047857',
      enabled: true,
      availableFrom: null,
      availableTo: null,
      sortOrder: 1,
    },
  ],
  rooms: [
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
  ],
};

test('resolveDestinationRoomForTopic resolves waiting defaults without a pseudo room', () => {
  const waitingSettings = {
    ...settings,
    topics: [{ ...settings.topics[0], defaultRoomId: 'pf_waiting' }],
    rooms: settings.rooms.map((room) => ({ ...room, defaultCallTarget: false })),
  };

  assert.deepEqual(resolveDestinationRoomForTopic(waitingSettings, 'mfa'), {
    roomId: 'pf_waiting',
    roomLabel: 'Wartezimmer',
  });
  assert.deepEqual(resolveDestinationRoomForTopic(waitingSettings, 'blut'), {
    roomId: 'pf_waiting',
    roomLabel: 'Wartezimmer',
  });
});

test('resolveCheckInDestinationRoomLabel uses visit target only', () => {
  assert.equal(
    resolveCheckInDestinationRoomLabel({
      publicName: 'Empfang',
      name: 'Empfang',
    }),
    'Empfang',
  );
  assert.equal(resolveCheckInDestinationRoomLabel({ name: 'Labor' }), 'Labor');
  assert.equal(resolveCheckInDestinationRoomLabel(null), null);
  assert.equal(resolveCheckInDestinationRoomLabel({}), null);
});
