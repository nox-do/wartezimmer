import { describe, expect, it } from 'vitest';
import {
  findRoomPanelLoginEntry,
  parseRoomPanelLoginKey,
  roomPanelLoginKey,
} from './room-panel-login-key';

describe('roomPanelLoginKey', () => {
  it('round-trips room and placement', () => {
    const key = roomPanelLoginKey({ roomId: 'labor', placement: 'inside' });
    expect(parseRoomPanelLoginKey(key)).toEqual({ roomId: 'labor', placement: 'inside' });
  });

  it('finds the matching login entry in a flat room list', () => {
    const rooms = [
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        placement: 'outside' as const,
        mode: 'arrival' as const,
        requiresPin: false,
      },
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        placement: 'inside' as const,
        mode: 'staff_full' as const,
        requiresPin: true,
      },
    ];
    expect(findRoomPanelLoginEntry(rooms, 'labor:inside')?.placement).toBe('inside');
  });
});
