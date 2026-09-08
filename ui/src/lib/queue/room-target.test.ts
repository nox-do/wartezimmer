import { describe, expect, it } from 'vitest';
import type { QueueItem } from './types';
import { resolveRoomTargetForCheckIn } from './room-target';

describe('resolveRoomTargetForCheckIn', () => {
  it('uses the Journey destination for an escorted room-to-room transfer', () => {
    const item = {
      roomId: 'empfang',
      roomLabel: 'Empfang',
      destinationRoomId: 'labor',
      destinationRoomLabel: 'Labor',
      escortTransferPending: true,
    } as QueueItem;

    expect(resolveRoomTargetForCheckIn(item)).toEqual({
      roomId: 'labor',
      roomLabel: 'Labor',
    });
  });

  it('keeps the current room for an ordinary arrival confirmation', () => {
    const item = {
      roomId: 'empfang',
      roomLabel: 'Empfang',
      destinationRoomId: 'labor',
      destinationRoomLabel: 'Labor',
      escortTransferPending: false,
    } as QueueItem;

    expect(resolveRoomTargetForCheckIn(item)).toEqual({
      roomId: 'empfang',
      roomLabel: 'Empfang',
    });
  });
});
