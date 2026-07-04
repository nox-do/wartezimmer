import type { QueueItem, QueueZone } from './types';

const ACTIVE_STATUSES = new Set(['called', 'in_room']);
const AWAY_STATUSES = new Set(['absent_wait_here', 'absent_return_later']);

export function getQueueZone(status: string): QueueZone | null {
  if (ACTIVE_STATUSES.has(status)) {
    return 'active';
  }
  if (AWAY_STATUSES.has(status)) {
    return 'away';
  }
  if (status === 'waiting') {
    return 'waiting';
  }
  return null;
}

export function partitionQueueItems(items: QueueItem[]): Record<QueueZone, QueueItem[]> {
  const active: QueueItem[] = [];
  const away: QueueItem[] = [];
  const waiting: QueueItem[] = [];

  for (const item of items) {
    const zone = getQueueZone(item.status);
    if (zone === 'active') {
      active.push(item);
    } else if (zone === 'away') {
      away.push(item);
    } else if (zone === 'waiting') {
      waiting.push(item);
    }
  }

  waiting.sort((a, b) => b.waitMs - a.waitMs);
  away.sort((a, b) => b.waitMs - a.waitMs);

  return { active, away, waiting };
}
