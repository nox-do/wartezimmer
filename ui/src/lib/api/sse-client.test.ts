import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SSE_CLIENT_ERROR, connectMultiEventSseStream, connectSseStream } from './sse-client';

const encoder = new TextEncoder();

function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Open stream that stays open so natural EOF reconnect does not fire. */
function openSseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encode(chunk));
      }
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function finiteSseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('sse-client', () => {
  const disconnects: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    while (disconnects.length > 0) {
      disconnects.pop()?.();
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function track(disconnect: () => void): () => void {
    disconnects.push(disconnect);
    return disconnect;
  }

  describe('shared transport contract', () => {
    it.each(['multi', 'single'] as const)(
      '%s delivers events split across fragmented chunks',
      async (mode) => {
        const events: unknown[] = [];
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => openSseResponse(['event: snapshot\ndata: {"id":', '1}\n\n'])),
        );

        if (mode === 'multi') {
          track(
            connectMultiEventSseStream({
              url: '/stream',
              handlers: { snapshot: (data) => events.push(data) },
            }),
          );
        } else {
          track(
            connectSseStream({
              url: '/stream',
              eventName: 'snapshot',
              onEvent: (data) => events.push(data),
            }),
          );
        }

        await flushMicrotasks();
        expect(events).toEqual([{ id: 1 }]);
      },
    );

    it.each(['multi', 'single'] as const)(
      '%s ignores ping comments and unknown events',
      async (mode) => {
        const events: unknown[] = [];
        vi.stubGlobal(
          'fetch',
          vi.fn(async () =>
            openSseResponse([
              ': ping\n\n',
              'event: other\ndata: {"x":1}\n\n',
              'event: snapshot\ndata: {"ok":true}\n\n',
            ]),
          ),
        );

        if (mode === 'multi') {
          track(
            connectMultiEventSseStream({
              url: '/stream',
              handlers: { snapshot: (data) => events.push(data) },
            }),
          );
        } else {
          track(
            connectSseStream({
              url: '/stream',
              eventName: 'snapshot',
              onEvent: (data) => events.push(data),
            }),
          );
        }

        await flushMicrotasks();
        expect(events).toEqual([{ ok: true }]);
      },
    );

    it.each(['multi', 'single'] as const)(
      '%s sends auth, csrf, role, credentials, and client-origin headers',
      async (mode) => {
        vi.stubGlobal('window', { location: { origin: 'http://clinic.local' } });
        const fetchMock = vi.fn(async () => openSseResponse([]));
        vi.stubGlobal('fetch', fetchMock);

        const shared = {
          url: '/api/v1/queue/stream',
          authToken: 'token-1',
          credentials: 'include' as const,
          csrfToken: 'csrf-1',
          csrfHeaderName: 'X-CSRF-Token',
          includeClientOriginHeader: true,
          clientRole: 'mfa' as const,
        };

        if (mode === 'multi') {
          track(
            connectMultiEventSseStream({
              ...shared,
              handlers: { snapshot: () => undefined },
            }),
          );
        } else {
          track(
            connectSseStream({
              ...shared,
              eventName: 'snapshot',
              onEvent: () => undefined,
            }),
          );
        }

        await flushMicrotasks();
        expect(fetchMock).toHaveBeenCalledOnce();
        const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
          RequestInfo | URL,
          RequestInit | undefined,
        ];
        const headers = new Headers(requestInit?.headers);
        expect(requestInit?.credentials).toBe('include');
        expect(headers.get('Accept')).toBe('text/event-stream');
        expect(headers.get('Authorization')).toBe('Bearer token-1');
        expect(headers.get('X-CSRF-Token')).toBe('csrf-1');
        expect(headers.get('X-Client-Origin')).toBe('http://clinic.local');
        expect(headers.get('X-Client-Role')).toBe('mfa');
      },
    );

    it.each([
      [401, SSE_CLIENT_ERROR.unauthorized],
      [403, SSE_CLIENT_ERROR.forbidden],
    ] as const)('%s reports auth error without reconnect', async (status, expectedError) => {
      const errors: string[] = [];
      const fetchMock = vi.fn(async () => finiteSseResponse([], status));
      vi.stubGlobal('fetch', fetchMock);

      track(
        connectMultiEventSseStream({
          url: '/stream',
          handlers: { snapshot: () => undefined },
          onError: (message) => errors.push(message),
        }),
      );

      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(5_000);

      expect(errors).toEqual([expectedError]);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('reconnects with exponential backoff after connect failures', async () => {
      const errors: string[] = [];
      const fetchMock = vi.fn(async () => finiteSseResponse([], 503));
      vi.stubGlobal('fetch', fetchMock);

      track(
        connectSseStream({
          url: '/stream',
          eventName: 'snapshot',
          onEvent: () => undefined,
          onError: (message) => errors.push(message),
        }),
      );

      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(errors).toEqual([SSE_CLIENT_ERROR.connectFailed]);

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('reconnects after network errors', async () => {
      const errors: string[] = [];
      const fetchMock = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      });
      vi.stubGlobal('fetch', fetchMock);

      track(
        connectMultiEventSseStream({
          url: '/stream',
          handlers: { snapshot: () => undefined },
          onError: (message) => errors.push(message),
        }),
      );

      await flushMicrotasks();
      expect(errors[0]).toBe(SSE_CLIENT_ERROR.networkUnreachable);

      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('disconnect aborts the in-flight fetch', async () => {
      let signal: AbortSignal | undefined;
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      });
      vi.stubGlobal('fetch', fetchMock);

      const disconnect = track(
        connectSseStream({
          url: '/stream',
          eventName: 'snapshot',
          onEvent: () => undefined,
          onError: () => undefined,
        }),
      );

      await flushMicrotasks();
      expect(signal?.aborted).toBe(false);

      disconnect();
      expect(signal?.aborted).toBe(true);
    });

    it('disconnect clears a scheduled reconnect timer', async () => {
      const fetchMock = vi.fn(async () => finiteSseResponse([], 503));
      vi.stubGlobal('fetch', fetchMock);

      const disconnect = track(
        connectSseStream({
          url: '/stream',
          eventName: 'snapshot',
          onEvent: () => undefined,
          onError: () => undefined,
        }),
      );

      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledOnce();

      disconnect();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('does not report onError when disconnect wins the race after fetch resolves', async () => {
      const deferred = createDeferred<Response>();
      const errors: string[] = [];
      const fetchMock = vi.fn(async () => deferred.promise);
      vi.stubGlobal('fetch', fetchMock);

      const disconnect = track(
        connectMultiEventSseStream({
          url: '/stream',
          handlers: { snapshot: () => undefined },
          onError: (message) => errors.push(message),
        }),
      );

      await flushMicrotasks();
      disconnect();
      deferred.resolve(finiteSseResponse([], 401));
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(errors).toEqual([]);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('does not dispatch events when disconnect wins while reader.read() is pending', async () => {
      const firstChunk = createDeferred<Uint8Array>();
      const events: unknown[] = [];
      let pullCount = 0;

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              pullCount += 1;
              if (pullCount === 1) {
                controller.enqueue(await firstChunk.promise);
                return;
              }
              await new Promise<never>(() => undefined);
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }),
      );

      const disconnect = track(
        connectMultiEventSseStream({
          url: '/stream',
          handlers: { snapshot: (data) => events.push(data) },
          onError: () => undefined,
        }),
      );

      await flushMicrotasks();
      expect(pullCount).toBe(1);

      disconnect();
      firstChunk.resolve(encode('event: snapshot\ndata: {"n":1}\n\n'));
      await flushMicrotasks();

      expect(events).toEqual([]);
    });
  });

  describe('error swallowing semantics', () => {
    it('skips invalid JSON and throwing handlers without reporting SSE_INVALID_DATA', async () => {
      const events: unknown[] = [];
      const errors: string[] = [];
      let shouldThrow = true;

      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          openSseResponse([
            'event: snapshot\ndata: {not-json}\n\n',
            'event: snapshot\ndata: {"step":1}\n\n',
            'event: snapshot\ndata: {"step":2}\n\n',
          ]),
        ),
      );

      track(
        connectMultiEventSseStream({
          url: '/stream',
          handlers: {
            snapshot: (data) => {
              if (shouldThrow) {
                shouldThrow = false;
                throw new Error('handler boom');
              }
              events.push(data);
            },
          },
          onError: (message) => errors.push(message),
        }),
      );

      await flushMicrotasks();
      expect(events).toEqual([{ step: 2 }]);
      expect(errors).toEqual([]);
    });

    it('single-event adapter preserves the same invalid JSON / handler isolation semantics', async () => {
      const events: unknown[] = [];
      const errors: string[] = [];
      let shouldThrow = true;

      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          openSseResponse([
            'event: snapshot\ndata: {not-json}\n\n',
            'event: snapshot\ndata: {"step":1}\n\n',
            'event: snapshot\ndata: {"step":2}\n\n',
          ]),
        ),
      );

      track(
        connectSseStream({
          url: '/stream',
          eventName: 'snapshot',
          onEvent: (data) => {
            if (shouldThrow) {
              shouldThrow = false;
              throw new Error('handler boom');
            }
            events.push(data);
          },
          onError: (message) => errors.push(message),
        }),
      );

      await flushMicrotasks();
      expect(events).toEqual([{ step: 2 }]);
      expect(errors).toEqual([]);
    });
  });

  describe('multi-event handlers', () => {
    it('dispatches multiple named events', async () => {
      const snapshots: unknown[] = [];
      const revocations: unknown[] = [];

      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          openSseResponse([
            'event: snapshot\ndata: {"n":1}\n\n',
            'event: session-revoked\ndata: {"code":"SESSION_REVOKED"}\n\n',
          ]),
        ),
      );

      track(
        connectMultiEventSseStream({
          url: '/stream',
          handlers: {
            snapshot: (data) => snapshots.push(data),
            'session-revoked': (data) => revocations.push(data),
          },
        }),
      );

      await flushMicrotasks();
      expect(snapshots).toEqual([{ n: 1 }]);
      expect(revocations).toEqual([{ code: 'SESSION_REVOKED' }]);
    });
  });

  describe('stream slots', () => {
    it('replaces an existing stream for the same URL and role', async () => {
      const firstEvents: unknown[] = [];
      const secondEvents: unknown[] = [];
      const signals: AbortSignal[] = [];
      let connectCount = 0;

      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          connectCount += 1;
          if (init?.signal) {
            signals.push(init.signal);
          }
          const id = connectCount;
          return openSseResponse([`event: snapshot\ndata: {"id":${id}}\n\n`]);
        }),
      );

      track(
        connectMultiEventSseStream({
          url: '/stream',
          clientRole: 'mfa',
          handlers: { snapshot: (data) => firstEvents.push(data) },
        }),
      );
      await flushMicrotasks();
      expect(signals[0]?.aborted).toBe(false);

      track(
        connectMultiEventSseStream({
          url: '/stream',
          clientRole: 'mfa',
          handlers: { snapshot: (data) => secondEvents.push(data) },
        }),
      );
      await flushMicrotasks();

      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      expect(firstEvents).toEqual([{ id: 1 }]);
      expect(secondEvents).toEqual([{ id: 2 }]);
      expect(connectCount).toBe(2);
    });

    it('keeps streams with different URL or role independent', async () => {
      const mfaEvents: unknown[] = [];
      const tvEvents: unknown[] = [];
      const otherUrlEvents: unknown[] = [];

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('other')) {
            return openSseResponse(['event: snapshot\ndata: {"src":"other"}\n\n']);
          }
          return openSseResponse(['event: snapshot\ndata: {"src":"shared"}\n\n']);
        }),
      );

      track(
        connectMultiEventSseStream({
          url: '/stream',
          clientRole: 'mfa',
          handlers: { snapshot: (data) => mfaEvents.push(data) },
        }),
      );
      track(
        connectSseStream({
          url: '/stream',
          clientRole: 'tv',
          eventName: 'snapshot',
          onEvent: (data) => tvEvents.push(data),
        }),
      );
      track(
        connectMultiEventSseStream({
          url: '/other',
          clientRole: 'mfa',
          handlers: { snapshot: (data) => otherUrlEvents.push(data) },
        }),
      );

      await flushMicrotasks();
      expect(mfaEvents).toEqual([{ src: 'shared' }]);
      expect(tvEvents).toEqual([{ src: 'shared' }]);
      expect(otherUrlEvents).toEqual([{ src: 'other' }]);
    });

    it('lets a single-event stream replace a multi-event stream on the same slot and vice versa', async () => {
      const multiEvents: unknown[] = [];
      const singleEvents: unknown[] = [];
      const signals: AbortSignal[] = [];
      let connectCount = 0;

      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          connectCount += 1;
          if (init?.signal) {
            signals.push(init.signal);
          }
          return openSseResponse([`event: snapshot\ndata: {"n":${connectCount}}\n\n`]);
        }),
      );

      track(
        connectMultiEventSseStream({
          url: '/stream',
          clientRole: 'tv',
          handlers: { snapshot: (data) => multiEvents.push(data) },
        }),
      );
      await flushMicrotasks();
      expect(signals[0]?.aborted).toBe(false);

      track(
        connectSseStream({
          url: '/stream',
          clientRole: 'tv',
          eventName: 'snapshot',
          onEvent: (data) => singleEvents.push(data),
        }),
      );
      await flushMicrotasks();

      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      expect(multiEvents).toEqual([{ n: 1 }]);
      expect(singleEvents).toEqual([{ n: 2 }]);

      track(
        connectMultiEventSseStream({
          url: '/stream',
          clientRole: 'tv',
          handlers: { snapshot: (data) => multiEvents.push(data) },
        }),
      );
      await flushMicrotasks();

      expect(signals).toHaveLength(3);
      expect(signals[1]?.aborted).toBe(true);
      expect(signals[2]?.aborted).toBe(false);
      expect(multiEvents).toEqual([{ n: 1 }, { n: 3 }]);
    });
  });

  describe('single-event adapter', () => {
    it('forwards only the configured event name to onEvent', async () => {
      const events: unknown[] = [];

      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          openSseResponse([
            'event: snapshot\ndata: {"keep":true}\n\n',
            'event: other\ndata: {"drop":true}\n\n',
            'event: snapshot\ndata: {"keep":2}\n\n',
          ]),
        ),
      );

      track(
        connectSseStream({
          url: '/stream',
          eventName: 'snapshot',
          onEvent: (data) => events.push(data),
        }),
      );

      await flushMicrotasks();
      expect(events).toEqual([{ keep: true }, { keep: 2 }]);
    });

    it('still forwards onError from the shared transport', async () => {
      const errors: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => finiteSseResponse([], 401)),
      );

      track(
        connectSseStream({
          url: '/stream',
          eventName: 'snapshot',
          onEvent: () => undefined,
          onError: (message) => errors.push(message),
        }),
      );

      await flushMicrotasks();
      expect(errors).toEqual([SSE_CLIENT_ERROR.unauthorized]);
    });
  });
});
