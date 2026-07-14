import { isBackendUnreachable } from '$lib/api/backend-unreachable';
import { buildApiStreamUrl } from '$lib/api/build-api-url';
import { mfaAuthFetch } from '$lib/api/staff-auth-fetch';
import { SSE_CLIENT_ERROR, connectSseStream } from '$lib/api/sse-client';
import { markAuthUnauthorized } from '$lib/auth/session-state.svelte';
import { t } from '$lib/i18n/i18nStore.svelte';
import type { Result } from '$lib/types/result';
import type { QueueResponse } from '$lib/queue/types';

export type MfaQueueStreamSnapshot = QueueResponse & {
  revision: number;
};

export type MfaQueueStreamError = {
  message: string;
  backendUnreachable: boolean;
};

export type MfaQueueStreamHandlers = {
  onSnapshot: (data: MfaQueueStreamSnapshot) => void;
  onError?: (error: MfaQueueStreamError) => void;
};

const VISIBLE_STALE_MS = 25_000;
const HIDDEN_STALE_MS = 5_000;
const POLL_MS = 3_000;

export async function fetchMfaQueue(): Promise<Result<MfaQueueStreamSnapshot>> {
  return mfaAuthFetch<MfaQueueStreamSnapshot>('/api/v1/queue');
}

function resolveStreamError(message: string): MfaQueueStreamError {
  if (message === SSE_CLIENT_ERROR.unauthorized || message === SSE_CLIENT_ERROR.forbidden) {
    markAuthUnauthorized('mfa');
    return { message: t('auth.loginRequiredTitle'), backendUnreachable: false };
  }
  if (message === SSE_CLIENT_ERROR.connectFailed) {
    return { message: t('mfa.queueStreamError'), backendUnreachable: false };
  }
  if (isBackendUnreachable(message)) {
    return { message: t('mfa.backendUnreachableTitle'), backendUnreachable: true };
  }
  return { message, backendUnreachable: false };
}

export function connectMfaQueueStream(handlers: MfaQueueStreamHandlers): () => void {
  let closed = false;
  let lastEventAt = Date.now();

  const onSnapshot = (data: MfaQueueStreamSnapshot) => {
    if (closed) {
      return;
    }
    lastEventAt = Date.now();
    handlers.onSnapshot(data);
  };

  const onError = (message: string) => {
    if (closed) {
      return;
    }
    handlers.onError?.(resolveStreamError(message));
  };

  const disconnectStream = connectSseStream<MfaQueueStreamSnapshot>({
    url: buildApiStreamUrl('/api/v1/queue/stream'),
    credentials: 'include',
    clientRole: 'mfa',
    eventName: 'snapshot',
    onEvent: onSnapshot,
    onError,
  });

  const pollTimer = setInterval(() => {
    if (closed) {
      return;
    }
    const staleMs =
      typeof document !== 'undefined' && document.hidden ? HIDDEN_STALE_MS : VISIBLE_STALE_MS;
    if (Date.now() - lastEventAt < staleMs) {
      return;
    }

    void fetchMfaQueue().then((result) => {
      if (closed) {
        return;
      }
      if (!result.ok) {
        if (result.error.status === 401 || result.error.status === 403) {
          markAuthUnauthorized('mfa');
          handlers.onError?.(resolveStreamError(SSE_CLIENT_ERROR.unauthorized));
        }
        return;
      }

      lastEventAt = Date.now();
      handlers.onSnapshot(result.data);
    });
  }, POLL_MS);

  return () => {
    closed = true;
    clearInterval(pollTimer);
    disconnectStream();
  };
}
