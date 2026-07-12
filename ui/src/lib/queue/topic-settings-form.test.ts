import { describe, expect, it } from 'vitest';
import { DEFAULT_TOPIC_ACCENT } from '$lib/topics/topic-accent';
import { formatTopicLabels, topicsReferencingMissingRooms } from './topic-settings-form';

describe('topicsReferencingMissingRooms', () => {
  it('returns topics whose defaultRoomId was removed or renamed away', () => {
    const rooms = [{ roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: true }];
    const topics = [
      {
        topicId: 'offen',
        label: 'Offen',
        laneCode: 'O',
        defaultRoomId: 'empfang',
        iconId: null,
        accentColor: DEFAULT_TOPIC_ACCENT,
        enabled: true,
        availableFrom: null,
        availableTo: null,
        sortOrder: 1,
      },
      {
        topicId: 'blut',
        label: 'Blutabnahme',
        laneCode: 'L',
        defaultRoomId: 'labor',
        iconId: null,
        accentColor: DEFAULT_TOPIC_ACCENT,
        enabled: true,
        availableFrom: null,
        availableTo: null,
        sortOrder: 2,
      },
    ];

    const blocked = topicsReferencingMissingRooms(topics, rooms);
    expect(blocked.map((topic) => topic.topicId)).toEqual(['offen']);
    expect(formatTopicLabels(blocked)).toBe('Offen');
  });

  it('does not treat a disabled-but-present room as missing', () => {
    const rooms = [
      { roomId: 'labor', roomLabel: 'Labor', enabled: false, defaultCallTarget: false },
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
    ];
    const topics = [
      {
        topicId: 'blut',
        label: 'Blutabnahme',
        laneCode: 'L',
        defaultRoomId: 'labor',
        journeyTemplateId: 'journey_blut',
        iconId: null,
        accentColor: DEFAULT_TOPIC_ACCENT,
        enabled: true,
        availableFrom: null,
        availableTo: null,
        sortOrder: 1,
      },
    ];

    expect(topicsReferencingMissingRooms(topics, rooms)).toEqual([]);
  });
});
