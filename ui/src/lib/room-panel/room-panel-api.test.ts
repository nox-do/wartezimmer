import { afterEach, describe, expect, it, vi } from 'vitest';
import { SSE_CLIENT_ERROR } from '$lib/api/sse-client';
import { isRoomPanelSessionExpiredError } from './room-panel-stream-error';
import { connectRoomPanelQueueStream, type RoomPanelStreamError } from './room-panel-api';

vi.mock('$lib/i18n/i18nStore.svelte', () => ({ t: (key: string) => key }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isRoomPanelSessionExpiredError', () => {
  it('marks rejected sessions so the UI removes the stale snapshot', () => {
    expect(isRoomPanelSessionExpiredError(SSE_CLIENT_ERROR.unauthorized)).toBe(true);
    expect(isRoomPanelSessionExpiredError(SSE_CLIENT_ERROR.forbidden)).toBe(true);
  });

  it('keeps transient stream errors separate from session expiry', () => {
    expect(isRoomPanelSessionExpiredError(SSE_CLIENT_ERROR.connectFailed)).toBe(false);
  });
});

describe('connectRoomPanelQueueStream', () => {
  it('reports an explicit server revocation immediately as an expired session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('event: session-revoked\ndata: {"code":"SESSION_REVOKED"}\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    );

    let disconnect: () => void = () => undefined;
    const error = new Promise<RoomPanelStreamError>((resolve) => {
      disconnect = connectRoomPanelQueueStream({
        onSnapshot: () => undefined,
        onError: resolve,
      });
    });

    await expect(error).resolves.toMatchObject({ sessionExpired: true });
    disconnect();
  });
});
