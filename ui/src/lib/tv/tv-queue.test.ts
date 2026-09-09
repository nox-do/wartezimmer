import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/i18n/i18nStore.svelte', () => ({
  t: (key: string) => key,
}));

import { partitionTvQueue } from './tv-queue';
import type { TvQueueItem } from './tv-queue';

function item(
  partial: Partial<TvQueueItem> & Pick<TvQueueItem, 'laneCode' | 'number' | 'status'>,
): TvQueueItem {
  return {
    roomLabel: null,
    movementMode: null,
    ...partial,
  };
}

describe('partitionTvQueue', () => {
  it('keeps call waiting on the left and called on the right', () => {
    const { waiting, calls } = partitionTvQueue([
      item({ laneCode: 'L', number: 1, status: 'waiting', movementMode: 'call' }),
      item({
        laneCode: 'L',
        number: 2,
        status: 'called',
        roomLabel: 'Labor',
        movementMode: 'call',
      }),
    ]);
    expect(waiting).toEqual([{ ticketCode: 'L-001', away: false, hint: undefined }]);
    expect(calls).toEqual([{ ticketCode: 'L-002', where: 'Labor' }]);
  });

  it('does not render directed self_go as a public call', () => {
    const { waiting, calls } = partitionTvQueue([
      item({
        laneCode: 'L',
        number: 4,
        status: 'directed',
        roomLabel: 'Labor',
        movementMode: 'self_go',
      }),
    ]);
    expect(waiting).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('puts pickup waiting on the right with pickup copy', () => {
    const { waiting, calls } = partitionTvQueue([
      item({
        laneCode: 'L',
        number: 5,
        status: 'waiting',
        roomLabel: 'Labor',
        movementMode: 'pickup',
      }),
    ]);
    expect(waiting).toEqual([]);
    expect(calls).toEqual([{ ticketCode: 'L-005', where: 'tv.pickupHint' }]);
  });
});
