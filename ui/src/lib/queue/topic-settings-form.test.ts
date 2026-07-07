import { describe, expect, it } from 'vitest';
import { DEFAULT_TOPIC_ACCENT } from '$lib/topics/topic-accent';
import { syncTopicDefaultRooms } from './topic-settings-form';

describe('syncTopicDefaultRooms', () => {
  it('falls back to defaultCallTarget room when topic default is unavailable', () => {
    const rooms = [
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: false, defaultCallTarget: false },
      { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: true },
    ];
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
    ];

    const next = syncTopicDefaultRooms(topics, rooms);
    expect(next[0]?.defaultRoomId).toBe('labor');
  });

  it('reconciles stale defaultRoomId for journey topics when room is disabled', () => {
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

    const next = syncTopicDefaultRooms(topics, rooms);
    expect(next[0]?.defaultRoomId).toBe('empfang');
    expect(next[0]?.journeyTemplateId).toBe('journey_blut');
  });
});
