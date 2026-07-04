import { t } from '$lib/i18n/i18nStore.svelte';
import { formatTicketCode } from '@praxis-flow/domain';
export type { TvQueueItem, TvQueueResponse } from '$lib/queue/openapi-types';
import type { TvQueueItem } from '$lib/queue/openapi-types';

export type TvWaitingRow = {
  ticketCode: string;
  away: boolean;
  hint?: string;
};

export type TvCallRow = {
  ticketCode: string;
  where: string;
};

export function partitionTvQueue(items: TvQueueItem[]): {
  waiting: TvWaitingRow[];
  calls: TvCallRow[];
} {
  const waiting: TvWaitingRow[] = [];
  const calls: TvCallRow[] = [];

  for (const item of items) {
    const ticketCode = formatTicketCode(item.laneCode, item.number);

    if (item.status === 'called') {
      calls.push({
        ticketCode,
        where: item.roomLabel?.trim() || t('tv.callTargetFallback'),
      });
      continue;
    }

    if (item.status === 'waiting' || item.status.startsWith('absent_')) {
      const away = item.status.startsWith('absent_');
      waiting.push({
        ticketCode,
        away,
        hint: away ? t('tv.awayHint') : undefined,
      });
    }
  }

  return { waiting, calls };
}
