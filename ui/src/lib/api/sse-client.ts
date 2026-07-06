import { NETWORK_UNREACHABLE_SIGNAL, toNetworkUnreachableSignal } from './backend-unreachable';

const MAX_RECONNECT_MS = 15_000;

type StreamSlot = {
  disconnect: () => void;
};

const activeStreamSlots = new Map<string, StreamSlot>();

function streamSlotKey(url: string, clientRole?: string): string {
  return `${url}|${clientRole ?? ''}`;
}

function claimStreamSlot(key: string, disconnect: () => void): void {
  activeStreamSlots.get(key)?.disconnect();
  activeStreamSlots.set(key, { disconnect });
}

function releaseStreamSlot(key: string, disconnect: () => void): void {
  const slot = activeStreamSlots.get(key);
  if (slot?.disconnect === disconnect) {
    activeStreamSlots.delete(key);
  }
}

export const SSE_CLIENT_ERROR = {
  connectFailed: 'SSE_CONNECT_FAILED',
  networkUnreachable: NETWORK_UNREACHABLE_SIGNAL,
  unauthorized: 'SSE_UNAUTHORIZED',
  forbidden: 'SSE_FORBIDDEN',
  invalidData: 'SSE_INVALID_DATA',
  interrupted: 'SSE_INTERRUPTED',
} as const;

function consumeSseBuffer(
  buffer: string,
  eventName: string,
  onEvent: (data: unknown) => void,
): string {
  return consumeMultiEventSseBuffer(buffer, { [eventName]: onEvent });
}

export type MultiEventSseHandlers = Record<string, (data: unknown) => void>;

function consumeMultiEventSseBuffer(buffer: string, handlers: MultiEventSseHandlers): string {
  const chunks = buffer.split('\n\n');
  const remainder = chunks.pop() ?? '';

  for (const chunk of chunks) {
    if (!chunk.trim() || chunk.startsWith(':')) {
      continue;
    }

    let chunkEvent = 'message';
    const dataLines: string[] = [];

    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) {
        chunkEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) {
      continue;
    }

    const handler = handlers[chunkEvent];
    if (!handler) {
      continue;
    }

    try {
      handler(JSON.parse(dataLines.join('\n')));
    } catch {
      continue;
    }
  }

  return remainder;
}

export type MultiEventSseStreamOptions = {
  url: string;
  authToken?: string;
  credentials?: RequestCredentials;
  csrfToken?: string;
  csrfHeaderName?: string;
  includeClientOriginHeader?: boolean;
  clientRole?: 'terminal' | 'tv' | 'room-panel';
  handlers: MultiEventSseHandlers;
  onError?: (message: string) => void;
};

export function connectMultiEventSseStream(options: MultiEventSseStreamOptions): () => void {
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let reconnectDelayMs = 1000;
  const slotKey = streamSlotKey(options.url, options.clientRole);

  const scheduleReconnect = () => {
    if (closed) {
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    reconnectTimer = setTimeout(() => {
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_MS);
      void connect();
    }, reconnectDelayMs);
  };

  const connect = async () => {
    if (closed) {
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    abortController?.abort();
    abortController = new AbortController();

    try {
      const headers = new Headers({
        Accept: 'text/event-stream',
      });

      if (options.authToken) {
        headers.set('Authorization', `Bearer ${options.authToken}`);
      }

      if (options.csrfToken) {
        headers.set(options.csrfHeaderName ?? 'X-CSRF-Token', options.csrfToken);
      }

      if (options.includeClientOriginHeader && typeof window !== 'undefined') {
        headers.set('X-Client-Origin', window.location.origin);
      }
      if (options.clientRole) {
        headers.set('X-Client-Role', options.clientRole);
      }

      const response = await fetch(options.url, {
        headers,
        credentials: options.credentials,
        signal: abortController.signal,
      });

      if (response.status === 401) {
        options.onError?.(SSE_CLIENT_ERROR.unauthorized);
        return;
      }

      if (response.status === 403) {
        options.onError?.(SSE_CLIENT_ERROR.forbidden);
        return;
      }

      if (!response.ok || !response.body) {
        options.onError?.(SSE_CLIENT_ERROR.connectFailed);
        scheduleReconnect();
        return;
      }

      reconnectDelayMs = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        try {
          buffer = consumeMultiEventSseBuffer(buffer, options.handlers);
        } catch {
          options.onError?.(SSE_CLIENT_ERROR.invalidData);
          buffer = '';
        }
      }

      if (!closed) {
        scheduleReconnect();
      }
    } catch (error) {
      if (closed || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }

      options.onError?.(
        toNetworkUnreachableSignal(error) ??
          (error instanceof Error ? error.message : SSE_CLIENT_ERROR.interrupted),
      );
      scheduleReconnect();
    }
  };

  const disconnect = () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    abortController?.abort();
    releaseStreamSlot(slotKey, disconnect);
  };

  claimStreamSlot(slotKey, disconnect);
  void connect();

  return disconnect;
}

export type SseStreamOptions<T> = {
  url: string;
  authToken?: string;
  credentials?: RequestCredentials;
  csrfToken?: string;
  csrfHeaderName?: string;
  includeClientOriginHeader?: boolean;
  clientRole?: 'terminal' | 'tv' | 'room-panel';
  eventName: string;
  onEvent: (data: T) => void;
  onError?: (message: string) => void;
};

export function connectSseStream<T>(options: SseStreamOptions<T>): () => void {
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let reconnectDelayMs = 1000;
  const slotKey = streamSlotKey(options.url, options.clientRole);

  const scheduleReconnect = () => {
    if (closed) {
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    reconnectTimer = setTimeout(() => {
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_MS);
      void connect();
    }, reconnectDelayMs);
  };

  const connect = async () => {
    if (closed) {
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    abortController?.abort();
    abortController = new AbortController();

    try {
      const headers = new Headers({
        Accept: 'text/event-stream',
      });

      if (options.authToken) {
        headers.set('Authorization', `Bearer ${options.authToken}`);
      }

      if (options.csrfToken) {
        headers.set(options.csrfHeaderName ?? 'X-CSRF-Token', options.csrfToken);
      }

      if (options.includeClientOriginHeader && typeof window !== 'undefined') {
        headers.set('X-Client-Origin', window.location.origin);
      }
      if (options.clientRole) {
        headers.set('X-Client-Role', options.clientRole);
      }

      const response = await fetch(options.url, {
        headers,
        credentials: options.credentials,
        signal: abortController.signal,
      });

      if (response.status === 401) {
        options.onError?.(SSE_CLIENT_ERROR.unauthorized);
        return;
      }

      if (response.status === 403) {
        options.onError?.(SSE_CLIENT_ERROR.forbidden);
        return;
      }

      if (!response.ok || !response.body) {
        options.onError?.(SSE_CLIENT_ERROR.connectFailed);
        scheduleReconnect();
        return;
      }

      reconnectDelayMs = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        try {
          buffer = consumeSseBuffer(buffer, options.eventName, (data) => {
            options.onEvent(data as T);
          });
        } catch {
          options.onError?.(SSE_CLIENT_ERROR.invalidData);
        }
      }

      if (!closed) {
        scheduleReconnect();
      }
    } catch (error) {
      if (closed || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }

      options.onError?.(
        toNetworkUnreachableSignal(error) ??
          (error instanceof Error ? error.message : SSE_CLIENT_ERROR.interrupted),
      );
      scheduleReconnect();
    }
  };

  const disconnect = () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    abortController?.abort();
    releaseStreamSlot(slotKey, disconnect);
  };

  claimStreamSlot(slotKey, disconnect);
  void connect();

  return disconnect;
}
