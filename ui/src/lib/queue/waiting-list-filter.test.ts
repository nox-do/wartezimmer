import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/i18n/i18nStore.svelte', () => ({
  t: (key: string) => key,
  tf: (key: string) => key,
}));

import type { QueueItem } from './types';
import {
  buildWaitingRows,
  filterWaitingList,
  uniqueWaitingLanes,
  waitingItemMatchesSearch,
} from './waiting-list-filter';

function item(partial: Partial<QueueItem> & Pick<QueueItem, 'visitId' | 'laneCode' | 'number'>): QueueItem {
  return {
    status: 'waiting',
    topicId: 'general',
    topicLabel: 'Allgemein',
    identityRef: null,
    arrivedAt: new Date().toISOString(),
    documentCount: 0,
    ...partial,
  } as QueueItem;
}

describe('waiting-list-filter', () => {
  const waiting = [
    item({
      visitId: 'v1',
      laneCode: 'A',
      number: 1,
      topicLabel: 'Blutabnahme',
      identityRef: 'Max Mustermann',
    }),
    item({
      visitId: 'v2',
      laneCode: 'B',
      number: 42,
      topicLabel: 'Impfung',
      identityRef: null,
    }),
    item({
      visitId: 'v3',
      laneCode: 'A',
      number: 12,
      topicLabel: 'Rezept',
      identityRef: 'Anna',
    }),
  ];

  it('matches ticket, name, and topic', () => {
    expect(waitingItemMatchesSearch(waiting[0]!, 'A-001')).toBe(true);
    expect(waitingItemMatchesSearch(waiting[0]!, '001')).toBe(true);
    expect(waitingItemMatchesSearch(waiting[0]!, 'max')).toBe(true);
    expect(waitingItemMatchesSearch(waiting[0]!, 'blut')).toBe(true);
    expect(waitingItemMatchesSearch(waiting[0]!, 'impfung')).toBe(false);
  });

  it('filters by search and ignores lane when search is set', () => {
    expect(
      filterWaitingList(waiting, { searchQuery: 'anna', laneCode: 'B' }).map((row) => row.visitId),
    ).toEqual(['v3']);
  });

  it('filters by lane when search is empty', () => {
    expect(
      filterWaitingList(waiting, { searchQuery: '  ', laneCode: 'A' }).map((row) => row.visitId),
    ).toEqual(['v1', 'v3']);
  });

  it('lists unique lanes in first-seen order', () => {
    expect(uniqueWaitingLanes(waiting)).toEqual(['A', 'B']);
  });

  it('builds long-wait divider rows', () => {
    const old = item({
      visitId: 'old',
      laneCode: 'A',
      number: 9,
      arrivedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const fresh = item({
      visitId: 'fresh',
      laneCode: 'B',
      number: 8,
      arrivedAt: new Date().toISOString(),
    });
    const rows = buildWaitingRows([old, fresh], Date.now());
    expect(rows.map((row) => (row.kind === 'divider' ? 'divider' : row.item.visitId))).toEqual([
      'old',
      'divider',
      'fresh',
    ]);
  });
});
