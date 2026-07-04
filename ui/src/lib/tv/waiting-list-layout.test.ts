import { describe, expect, it } from 'vitest';
import { buildWaitingListLayout, rowsThatFit } from './waiting-list-layout';
import type { TvWaitingRow } from './tv-queue';

function waitingRows(count: number): TvWaitingRow[] {
  return Array.from({ length: count }, (_, index) => ({
    ticketCode: `A-${String(index).padStart(3, '0')}`,
    away: false,
  }));
}

describe('buildWaitingListLayout', () => {
  it('returns an empty page when there are no items', () => {
    expect(buildWaitingListLayout([], 400, 50)).toEqual({ columns: 1, pages: [[]] });
  });

  it('returns an empty page when viewport or item height is invalid', () => {
    expect(buildWaitingListLayout(waitingRows(3), 0, 50)).toEqual({ columns: 1, pages: [[]] });
    expect(buildWaitingListLayout(waitingRows(3), 400, 0)).toEqual({ columns: 1, pages: [[]] });
  });

  it('uses a single column when all items fit on one page', () => {
    const items = waitingRows(3);
    expect(buildWaitingListLayout(items, 300, 50)).toEqual({ columns: 1, pages: [items] });
  });

  it('splits into two columns and multiple pages when items overflow', () => {
    const items = waitingRows(10);
    const layout = buildWaitingListLayout(items, 200, 50);

    expect(layout.columns).toBe(2);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0]).toHaveLength(8);
    expect(layout.pages[1]).toHaveLength(2);
  });

  it('uses at least one row per page in two-column mode', () => {
    const items = waitingRows(4);
    const layout = buildWaitingListLayout(items, 30, 50);

    expect(layout.columns).toBe(2);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0]).toHaveLength(2);
    expect(layout.pages[1]).toHaveLength(2);
  });

  it('stays single-column when the viewport is too narrow for two columns', () => {
    const items = waitingRows(10);
    const layout = buildWaitingListLayout(items, 200, 50, {
      viewportWidth: 300,
      minColumnWidth: 160,
    });

    expect(layout.columns).toBe(1);
    expect(layout.pages).toHaveLength(3);
    expect(layout.pages[0]).toHaveLength(4);
    expect(layout.pages[1]).toHaveLength(4);
    expect(layout.pages[2]).toHaveLength(2);
  });

  it('accounts for vertical gap when calculating page capacity', () => {
    const items = waitingRows(6);
    expect(rowsThatFit(200, 50, 0)).toBe(4);
    expect(rowsThatFit(200, 50, 20)).toBe(3);
    expect(
      buildWaitingListLayout(items, 200, 50, {
        itemGap: 20,
        viewportWidth: 300,
        minColumnWidth: 160,
      }).pages[0],
    ).toHaveLength(3);
  });
});
