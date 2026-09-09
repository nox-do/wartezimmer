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
    terminalAssistancePending: false,
    escortTransferPending: false,
    ...overrides,
  };
}

describe('resolveCallRoomTarget', () => {
  const routing = {
    rooms: [
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: true },
      { roomId: 'labor', roomLabel: 'Labor', enabled: true },
    ],
    routingMode: 'simple' as const,
    postWaitingCallTargetId: 'empfang',
    callRoomOverrideId: null,
  };

  it('uses ticket destination when quicksettings override is off', () => {
    expect(resolveCallRoomTarget(waitingTicket())).toEqual({
      roomId: 'empfang',
      roomLabel: 'Empfang',
    });
  });

  it('returns undefined when ticket has no destination snapshot', () => {
    expect(
      resolveCallRoomTarget(
        waitingTicket({ destinationRoomId: undefined, destinationRoomLabel: undefined }),
      ),
    ).toBeUndefined();
  });

  it('uses the persisted or temporary target for a simple waiting-room call', () => {
    const item = waitingTicket({
      destinationRoomId: 'pf_waiting',
      destinationRoomLabel: 'Wartezimmer',
      movementMode: 'call',
    });
    expect(resolveCallRoomTarget(item, routing)).toEqual({
      roomId: 'empfang',
      roomLabel: 'Empfang',
    });
    expect(resolveCallRoomTarget(item, { ...routing, callRoomOverrideId: 'labor' })).toEqual({
      roomId: 'labor',
      roomLabel: 'Labor',
    });
  });

  it('does not override complex routing or assisted patients', () => {
    const item = waitingTicket({
      destinationRoomId: 'pf_waiting',
      destinationRoomLabel: 'Wartezimmer',
      movementMode: 'call',
    });
    expect(resolveCallRoomTarget(item, { ...routing, routingMode: 'complex' })).toEqual({
      roomId: 'pf_waiting',
      roomLabel: 'Wartezimmer',
    });
    expect(resolveCallRoomTarget({ ...item, needsAssistance: true }, routing)).toEqual({
      roomId: 'pf_waiting',
      roomLabel: 'Wartezimmer',
    });
  });
});
