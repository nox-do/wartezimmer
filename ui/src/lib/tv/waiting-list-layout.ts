export const WAITING_PAGE_MS = 6_000;

export type WaitingListLayout<T> = {
  columns: 1 | 2;
  pages: T[][];
};

export type WaitingListLayoutOptions = {
  viewportWidth?: number;
  /** Minimum width per column before allowing a two-column layout. */
  minColumnWidth?: number;
  /** Vertical gap between rows (px). */
  itemGap?: number;
  /** Override computed row capacity (used while shrinking an overfull page). */
  maxRowsPerPage?: number;
};

function paginateSingleColumn<T>(items: T[], perPage: number): WaitingListLayout<T> {
  const capacity = Math.max(1, perPage);
  const pages: T[][] = [];

  for (let index = 0; index < items.length; index += capacity) {
    pages.push(items.slice(index, index + capacity));
  }

  return { columns: 1, pages };
}

function twoColumnsAllowed(options: WaitingListLayoutOptions): boolean {
  const { viewportWidth, minColumnWidth } = options;
  if (viewportWidth == null || minColumnWidth == null) {
    return true;
  }
  return viewportWidth >= minColumnWidth * 2;
}

/** Rows that fit including vertical gaps between items. */
export function rowsThatFit(viewportHeight: number, itemHeight: number, itemGap = 0): number {
  if (viewportHeight <= 0 || itemHeight <= 0) {
    return 0;
  }
  return Math.max(1, Math.floor((viewportHeight + itemGap) / (itemHeight + itemGap)));
}

export function buildWaitingListLayout<T>(
  items: T[],
  viewportHeight: number,
  itemHeight: number,
  options: WaitingListLayoutOptions = {},
): WaitingListLayout<T> {
  if (items.length === 0 || viewportHeight <= 0 || itemHeight <= 0) {
    return { columns: 1, pages: [[]] };
  }

  const gap = options.itemGap ?? 0;
  const rows =
    options.maxRowsPerPage != null
      ? Math.max(1, options.maxRowsPerPage)
      : rowsThatFit(viewportHeight, itemHeight, gap);
  const singleCapacity = rows;

  if (items.length <= singleCapacity) {
    return { columns: 1, pages: [items] };
  }

  if (!twoColumnsAllowed(options)) {
    return paginateSingleColumn(items, singleCapacity);
  }

  const perPage = rows * 2;
  const pages: T[][] = [];

  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }

  return { columns: 2, pages };
}
