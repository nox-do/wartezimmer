// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeAuthPin,
  fetchAuthStatus,
  loginAuthSession,
  logoutAuthSession,
} from './session-client';
import { staffAuthSlots } from './staff-auth-slot-state.svelte';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function response(status = 200) {
  const fetch = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify(
            status === 200 ? { ok: true } : { code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized' },
          ),
          { status },
        ),
    );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function notifiedRole() {
  const value = window.localStorage.getItem('pf_staff_session_changed');
  return value ? JSON.parse(value).role : null;
}

describe('session change invalidation hints', () => {
  for (const role of ['mfa', 'ops'] as const) {
    it(`notifies other tabs after a successful ${role} PIN change`, async () => {
      const fetch = response();
      const result = await changeAuthPin({
        currentPin: '0000',
        newPin: '2468',
        target: role,
        role,
      });
      expect(result.ok).toBe(true);
      expect(notifiedRole()).toBe(role);
      expect(new Headers(fetch.mock.calls[0][1].headers).get('X-Client-Role')).toBe(role);
      expect(window.localStorage.getItem('pf_staff_session_changed')).not.toContain('2468');
    });
  }

  it('does not notify a staff session change after a room-panel PIN change or a failed change', async () => {
    response();
    await changeAuthPin({ currentPin: '2468', newPin: '2222', target: 'room-panel', role: 'mfa' });
    expect(notifiedRole()).toBeNull();
    response(400);
    await changeAuthPin({ currentPin: 'wrong', newPin: '2468', target: 'mfa', role: 'mfa' });
    expect(notifiedRole()).toBeNull();
  });

  it('notifies other tabs after login and logout', async () => {
    response();
    await loginAuthSession({ pin: '0000', role: 'ops' });
    expect(notifiedRole()).toBe('ops');
    window.localStorage.clear();
    await logoutAuthSession('mfa');
    expect(notifiedRole()).toBe('mfa');
  });

  it('leaves status 401 handling to the versioned state loader', async () => {
    staffAuthSlots.mfa.status = 'authenticated';
    staffAuthSlots.mfa.user = { id: 'new-login', role: 'mfa', pinChangeRequired: false };
    response(401);
    expect((await fetchAuthStatus('mfa')).ok).toBe(false);
    expect(staffAuthSlots.mfa.status).toBe('authenticated');
    expect(staffAuthSlots.mfa.user?.id).toBe('new-login');
  });
});

it('does not let a late mutation 401 discard a newer staff session', async () => {
  staffAuthSlots.mfa.status = 'authenticated';
  staffAuthSlots.mfa.user = { id: 'old-session', role: 'mfa', pinChangeRequired: true };
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = changeAuthPin({ currentPin: '0000', newPin: '2468', target: 'mfa', role: 'mfa' });
  staffAuthSlots.mfa.user = { id: 'new-session', role: 'mfa', pinChangeRequired: true };
  finish(
    new Response(JSON.stringify({ code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized' }), {
      status: 401,
    }),
  );
  expect((await pending).ok).toBe(false);
  expect(staffAuthSlots.mfa.user?.id).toBe('new-session');
  expect(staffAuthSlots.mfa.status).toBe('authenticated');
});

it('still expires the current staff session on a mutation 401', async () => {
  staffAuthSlots.ops.status = 'authenticated';
  staffAuthSlots.ops.user = { id: 'expired-session', role: 'ops', pinChangeRequired: true };
  response(401);
  expect((await logoutAuthSession('ops')).ok).toBe(false);
  expect(staffAuthSlots.ops.status).toBe('anonymous');
});
