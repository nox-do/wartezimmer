import { describe, expect, it } from 'vitest';
import type { QueueItem } from './types';
import { resolveCallRoomTarget } from './call-room-target';

function waitingTicket(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    visitId: 't1',
    topicId: 'offen',
    laneCode: 'O',
    number: 1,
    status: 'waiting',
    arrivedAt: '2026-06-10T10:00:00.000Z',
    waitMs: 0,
    documentCount: 0,
    hasMobilePhone: false,
    destinationRoomId: 'empfang',
    destinationRoomLabel: 'Empfang',
    needsAssistance: false,
    ...overrides,
  };
}

describe('resolveCallRoomTarget', () => {
  it('uses ticket destination when quicksettings override is off', () => {
    expect(resolveCallRoomTarget(waitingTicket(), undefined)).toEqual({
      roomId: 'empfang',
      roomLabel: 'Empfang',
    });
  });

  it('uses session override when a room toggle is pressed', () => {
    expect(resolveCallRoomTarget(waitingTicket(), { roomId: 'labor', roomLabel: 'Labor' })).toEqual(
      { roomId: 'labor', roomLabel: 'Labor' },
    );
  });

  it('returns undefined when ticket has no destination snapshot', () => {
    expect(
      resolveCallRoomTarget(
        waitingTicket({ destinationRoomId: undefined, destinationRoomLabel: undefined }),
        undefined,
      ),
    ).toBeUndefined();
  });
});
