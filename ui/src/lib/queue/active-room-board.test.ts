import { describe, expect, it } from 'vitest';
import type { PracticeRoom } from '$lib/ops/openapi-types';
import type { QueueItem } from './types';
import { buildActiveRoomBoard } from './active-room-board';

const rooms: PracticeRoom[] = [
  { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
  { roomId: 'kirche', roomLabel: 'kirche', enabled: true, defaultCallTarget: false },
];

function ticket(overrides: Partial<QueueItem> & Pick<QueueItem, 'visitId' | 'roomId'>): QueueItem {
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
    needsAssistance: false,
    terminalAssistancePending: false,
    escortTransferPending: false,
    ...overrides,
  };
}

describe('buildActiveRoomBoard', () => {
  it('returns all enabled rooms including empty groups', () => {
    const board = buildActiveRoomBoard([], rooms);
    expect(board.groups.map((group) => group.roomId)).toEqual(['empfang', 'kirche']);
    expect(board.groups.every((group) => group.tickets.length === 0)).toBe(true);
    expect(board.underway).toEqual([]);
    expect(board.unassigned).toEqual([]);
  });

  it('groups tickets by roomId and collects unknown roomIds as unassigned', () => {
    const board = buildActiveRoomBoard(
      [
        ticket({ visitId: 'a', roomId: 'empfang', status: 'called' }),
        ticket({ visitId: 'b', roomId: 'kirche', status: 'in_room' }),
        ticket({ visitId: 'c', roomId: 'unknown', status: 'called' }),
        ticket({ visitId: 'd', roomId: null, status: 'called' }),
      ],
      rooms,
    );

    expect(board.underway.map((item) => item.visitId)).toEqual(['a']);
    expect(board.groups[0]?.tickets.map((item) => item.visitId)).toEqual([]);
    expect(board.groups[1]?.tickets.map((item) => item.visitId)).toEqual(['b']);
    expect(board.unassigned.map((item) => item.visitId)).toEqual(['c', 'd']);
  });

  it('keeps called and directed underway while counting called for room capacity', () => {
    const board = buildActiveRoomBoard(
      [
        ticket({ visitId: 'called', roomId: 'empfang', status: 'called' }),
        ticket({
          visitId: 'directed',
          roomId: null,
          destinationRoomId: 'empfang',
          status: 'directed',
        }),
      ],
      [{ ...rooms[0]!, maxOccupancy: 1 }],
    );
    expect(board.underway.map((item) => item.visitId)).toEqual(['called', 'directed']);
    expect(board.groups[0]?.occupantCount).toBe(1);
    expect(board.groups[0]?.isAtCapacity).toBe(true);
  });

  it('groups underway tickets by destination when the separate box is hidden', () => {
    const board = buildActiveRoomBoard(
      [
        ticket({
          visitId: 'called',
          roomId: 'empfang',
          destinationRoomId: 'empfang',
          status: 'called',
        }),
        ticket({
          visitId: 'directed',
          roomId: null,
          destinationRoomId: 'kirche',
          status: 'directed',
        }),
      ],
      rooms,
      false,
    );

    expect(board.underway).toEqual([]);
    expect(board.groups[0]?.tickets.map((item) => item.visitId)).toEqual(['called']);
    expect(board.groups[1]?.tickets.map((item) => item.visitId)).toEqual(['directed']);
  });

  it('keeps an escorted transfer at its current room until pickup', () => {
    const transfer = ticket({
      visitId: 'transfer',
      roomId: 'empfang',
      roomLabel: 'Empfang',
      status: 'in_room',
      movementMode: 'pickup',
      destinationRoomId: 'kirche',
      destinationRoomLabel: 'kirche',
      needsAssistance: true,
      escortTransferPending: true,
    });

    const board = buildActiveRoomBoard([transfer], rooms);
    expect(board.groups[0]?.tickets.map((item) => item.visitId)).toEqual(['transfer']);
    expect(board.groups[1]?.tickets).toEqual([]);
    expect(board.underway).toEqual([]);
  });
});
