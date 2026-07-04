import { describe, expect, it } from 'vitest';
import type { PracticeRoom } from '$lib/ops/openapi-types';
import type { QueueItem } from './types';
import { buildActiveRoomBoard } from './active-room-board';

const rooms: PracticeRoom[] = [
  { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
  { roomId: 'kirche', roomLabel: 'kirche', enabled: true, defaultCallTarget: false },
];

function ticket(overrides: Partial<QueueItem> & Pick<QueueItem, 'ticketId' | 'roomId'>): QueueItem {
  return {
    laneCode: 'M',
    number: 1,
    topicId: 'mfa',
    status: 'called',
    roomLabel: null,
    arrivedAt: '2026-06-10T10:00:00.000Z',
    waitMs: 0,
    documentCount: 0,
    checkinPhone: null,
    callbackPhone: null,
    recallNotifyErrorCode: null,
    recallNotifySent: false,
    hasMobilePhone: false,
    returnUntil: null,
    ...overrides,
  };
}

describe('buildActiveRoomBoard', () => {
  it('returns all enabled rooms including empty groups', () => {
    const board = buildActiveRoomBoard([], rooms);
    expect(board.groups.map((group) => group.roomId)).toEqual(['empfang', 'kirche']);
    expect(board.groups.every((group) => group.tickets.length === 0)).toBe(true);
    expect(board.unassigned).toEqual([]);
  });

  it('groups tickets by roomId and collects unknown roomIds as unassigned', () => {
    const board = buildActiveRoomBoard(
      [
        ticket({ ticketId: 'a', roomId: 'empfang', status: 'called' }),
        ticket({ ticketId: 'b', roomId: 'kirche', status: 'in_room' }),
        ticket({ ticketId: 'c', roomId: 'unknown', status: 'called' }),
        ticket({ ticketId: 'd', roomId: null, status: 'called' }),
      ],
      rooms,
    );

    expect(board.groups[0]?.tickets.map((item) => item.ticketId)).toEqual(['a']);
    expect(board.groups[1]?.tickets.map((item) => item.ticketId)).toEqual(['b']);
    expect(board.unassigned.map((item) => item.ticketId)).toEqual(['c', 'd']);
  });
});
