import { describe, expect, it } from 'vitest';
import {
  resolveRoomPanelQueueFetchOutcome,
  resolveRoomPanelTransitionOutcome,
} from './room-panel-transition';

describe('resolveRoomPanelTransitionOutcome', () => {
  it('maps 409 to conflict refresh flow', () => {
    expect(
      resolveRoomPanelTransitionOutcome(
        {
          ok: false,
          error: { message: 'TV offline', status: 409, code: 'CALL_ANNOUNCEMENT_OFFLINE' },
        },
        'fallback',
      ),
    ).toEqual({ kind: 'conflict', message: 'TV offline' });
  });

  it('maps live capability 403 to forbidden refresh without logout', () => {
    expect(
      resolveRoomPanelTransitionOutcome(
        {
          ok: false,
          error: {
            message: 'Patienten aufrufen ist für dieses Raum-Panel nicht aktiviert.',
            status: 403,
            code: 'AUTH_FORBIDDEN',
          },
        },
        'fallback',
      ),
    ).toEqual({
      kind: 'forbidden',
      message: 'Patienten aufrufen ist für dieses Raum-Panel nicht aktiviert.',
    });
  });

  it('maps 401 to session expiry', () => {
    expect(
      resolveRoomPanelTransitionOutcome(
        { ok: false, error: { message: 'Unauthorized', status: 401 } },
        'fallback',
      ),
    ).toEqual({ kind: 'sessionExpired', message: 'Unauthorized' });
  });
});

describe('resolveRoomPanelQueueFetchOutcome', () => {
  it('treats queue 403 as session invalid for relogin', () => {
    expect(
      resolveRoomPanelQueueFetchOutcome(
        { ok: false, error: { message: 'Session erforderlich', status: 403 } },
        'fallback',
      ),
    ).toEqual({ kind: 'sessionExpired', message: 'Session erforderlich' });
  });
});
