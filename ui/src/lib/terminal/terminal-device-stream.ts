import { buildApiStreamUrl } from '$lib/api/build-api-url';
import { SSE_CLIENT_ERROR, connectMultiEventSseStream } from '$lib/api/sse-client';

export type TerminalDeviceStreamHandlers = {
  onError?: (message: string) => void;
};

export function connectTerminalDeviceStream(
  handlers: TerminalDeviceStreamHandlers = {},
): () => void {
  return connectMultiEventSseStream({
    url: buildApiStreamUrl('/api/v1/ops/device/stream'),
    credentials: 'include',
    clientRole: 'terminal',
    handlers: {},
    onError: (message) => {
      handlers.onError?.(message);
    },
  });
}

export { SSE_CLIENT_ERROR };
