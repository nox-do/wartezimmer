import { buildApiStreamUrl } from '$lib/api/build-api-url';
import { SSE_CLIENT_ERROR, connectSseStream } from '$lib/api/sse-client';
import { t } from '$lib/i18n/i18nStore.svelte';
import type { TvQueueResponse } from '$lib/tv/tv-queue';

export type TvQueueStreamHandlers = {
  onSnapshot: (data: TvQueueResponse) => void;
  onError?: (message: string) => void;
};

export function connectTvQueueStream(handlers: TvQueueStreamHandlers): () => void {
  return connectSseStream<TvQueueResponse>({
    url: buildApiStreamUrl('/api/v1/queue/stream'),
    credentials: 'include',
    includeClientOriginHeader: true,
    clientRole: 'tv',
    eventName: 'snapshot',
    onEvent: handlers.onSnapshot,
    onError: (message) => {
      if (message === SSE_CLIENT_ERROR.connectFailed) {
        handlers.onError?.(t('tv.queueStreamError'));
        return;
      }
      handlers.onError?.(message);
    },
  });
}
