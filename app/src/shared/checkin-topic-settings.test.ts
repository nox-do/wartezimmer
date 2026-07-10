import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveDestinationRoomLabelForTopic,
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

test('resolveDestinationRoomLabelForTopic returns topic default room label', () => {
  assert.equal(resolveDestinationRoomLabelForTopic(settings, 'blut'), 'Labor');
});

test('resolveDestinationRoomLabelForTopic returns default call target for MFA assist', () => {
  assert.equal(resolveDestinationRoomLabelForTopic(settings, 'mfa'), 'Empfang');
});

test('resolveDestinationRoomLabelForTopic falls back to default call target when topic room is missing', () => {
  const staleTopicSettings = {
    ...settings,
    topics: [{ ...settings.topics[0], defaultRoomId: 'unknown-room' }],
  };
  assert.equal(resolveDestinationRoomLabelForTopic(staleTopicSettings, 'blut'), 'Empfang');
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
