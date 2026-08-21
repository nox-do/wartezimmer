import { describe, expect, it } from 'vitest';
import type { PracticeRoom } from '$lib/ops/openapi-types';
import { roomHasCapacity, roomOccupancyLabel } from './room-capacity';

const rooms: PracticeRoom[] = [
  {
    roomId: 'behandlung',
    roomLabel: 'Behandlung',
    enabled: true,
    defaultCallTarget: true,
    maxOccupancy: 1,
  },
];

const items = [{ visitId: 't1', roomId: 'behandlung', status: 'called' as const }];

describe('room-capacity adapter', () => {
  it('maps visitId to domain occupantId', () => {
    expect(roomHasCapacity(rooms, items, 'behandlung', 't1')).toBe(true);
    expect(roomHasCapacity(rooms, items, 'behandlung')).toBe(false);
  });

  it('formats occupancy labels only for limited rooms', () => {
    expect(roomOccupancyLabel(1, null)).toBeNull();
    expect(roomOccupancyLabel(1, 1)).toBe('1/1');
  });
});
