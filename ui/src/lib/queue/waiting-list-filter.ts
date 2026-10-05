import { formatTicketCode } from '@praxis-flow/domain';
import { computeWaitMs, isLongWait, LONG_WAIT_THRESHOLD_MINUTES } from './format-wait-duration';
import type { QueueItem } from './types';

/** Local MFA waiting-list filter — search XOR lane, never both. */
export type WaitingListFilter = {
  searchQuery: string;
  laneCode: string | null;
};

export type WaitingRow = { kind: 'item'; item: QueueItem } | { kind: 'divider' };

export function normalizeWaitingSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function waitingItemMatchesSearch(item: QueueItem, rawQuery: string): boolean {
  const query = normalizeWaitingSearchQuery(rawQuery);
  if (!query) {
    return true;
  }

  const ticket = formatTicketCode(item.laneCode, item.number).toLowerCase();
  const ticketCompact = ticket.replace(/-/g, '');
  const queryCompact = query.replace(/-/g, '');
  const number = String(item.number);
  const padded = number.padStart(3, '0');
  const lane = item.laneCode.trim().toLowerCase();
  const name = (item.identityRef ?? '').trim().toLowerCase();
  const topic = (item.topicLabel ?? '').trim().toLowerCase();
  const topicId = (item.topicId ?? '').trim().toLowerCase();

  return (
    ticket.includes(query) ||
    ticketCompact.includes(queryCompact) ||
    number.includes(query) ||
    padded.includes(query) ||
    lane === query ||
    lane.startsWith(query) ||
    name.includes(query) ||
    topic.includes(query) ||
    topicId.includes(query)
  );
}

/**
 * Applies local waiting filter. If both search and lane are set (should not happen in UI),
 * search wins so typing always has a defined effect.
 */
export function filterWaitingList(items: QueueItem[], filter: WaitingListFilter): QueueItem[] {
  const query = normalizeWaitingSearchQuery(filter.searchQuery);
  if (query) {
    return items.filter((item) => waitingItemMatchesSearch(item, query));
  }

  const lane = filter.laneCode?.trim().toUpperCase() ?? '';
  if (lane) {
    return items.filter((item) => item.laneCode.trim().toUpperCase() === lane);
  }

  return items;
}

/** Distinct lane codes currently present in the waiting list (display order = first seen). */
export function uniqueWaitingLanes(items: QueueItem[]): string[] {
  const seen = new Set<string>();
  const lanes: string[] = [];
  for (const item of items) {
    const lane = item.laneCode.trim().toUpperCase();
    if (!lane || seen.has(lane)) {
      continue;
    }
    seen.add(lane);
    lanes.push(lane);
  }
  return lanes;
}

export function buildWaitingRows(
  waiting: QueueItem[],
  nowMs: number,
  thresholdMinutes = LONG_WAIT_THRESHOLD_MINUTES,
): WaitingRow[] {
  const longWait = waiting.filter((item) =>
    isLongWait(computeWaitMs(item.arrivedAt, nowMs), thresholdMinutes),
  );
  const shortWait = waiting.filter(
    (item) => !isLongWait(computeWaitMs(item.arrivedAt, nowMs), thresholdMinutes),
  );
  const rows: WaitingRow[] = [];

  for (const item of longWait) {
    rows.push({ kind: 'item', item });
  }
  if (longWait.length > 0 && shortWait.length > 0) {
    rows.push({ kind: 'divider' });
  }
  for (const item of shortWait) {
    rows.push({ kind: 'item', item });
  }

  return rows;
}
