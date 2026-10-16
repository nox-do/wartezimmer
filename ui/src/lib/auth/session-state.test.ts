import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionStatus } from './session-client';
import type { Result } from '$lib/types/result';

const api = vi.hoisted(() => ({
  fetchAuthStatus: vi.fn(),
  loginAuthSession: vi.fn(),
  changeAuthPin: vi.fn(),
  logoutAuthSession: vi.fn(),
}));
vi.mock('./session-client', () => api);

function session(role: 'mfa' | 'ops', required: boolean, id = 'shared-cookie') {
  return {
    ok: true as const,
    data: {
      ok: true as const,
      sessionId: id,
      role,
      pinChangeRequired: required,
      expiresAt: '2099-01-01T00:00:00Z',
    },
  };
}

function deferred() {
  let resolve!: (result: Result<AuthSessionStatus>) => void;
  const promise = new Promise<Result<AuthSessionStatus>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

describe('staff session refresh across tabs', () => {
  it('rechecks a restricted MFA session without unmounting its form or loading unused Ops', async () => {
    const state = await import('./session-state.svelte');
    await state.refreshAuthSession('ops');
    expect(api.fetchAuthStatus).not.toHaveBeenCalled();
    api.fetchAuthStatus.mockResolvedValueOnce(session('mfa', true));
    await state.loadAuthSession('mfa');
    const next = deferred();
    api.fetchAuthStatus.mockReturnValueOnce(next.promise);
    const refresh = state.refreshAuthSession('mfa');
    await Promise.resolve();
    expect(state.staffAuthSlots.mfa.status).toBe('authenticated');
    expect(state.staffAuthSlots.mfa.user?.pinChangeRequired).toBe(true);
    next.resolve(session('mfa', false));
    await refresh;
    expect(state.staffAuthSlots.mfa.user?.pinChangeRequired).toBe(false);
    expect(state.staffAuthSlots.mfa.user?.id).toBe('shared-cookie');
    expect(state.staffAuthSlots.ops.status).toBe('idle');
  });

  it('returns revoked Ops sessions to login and leaves MFA untouched', async () => {
    const state = await import('./session-state.svelte');
    api.fetchAuthStatus
      .mockResolvedValueOnce(session('mfa', true))
      .mockResolvedValueOnce(session('ops', true));
    await state.loadAuthSession('mfa');
    await state.loadAuthSession('ops');
    api.fetchAuthStatus.mockResolvedValueOnce({
      ok: false,
      error: { status: 401, message: 'Unauthorized' },
    });
    await state.refreshAuthSession('ops');
    expect(state.staffAuthSlots.ops.status).toBe('anonymous');
    expect(state.staffAuthSlots.mfa.user?.pinChangeRequired).toBe(true);
  });

  it('does not let a late 401 discard a newer login', async () => {
    const state = await import('./session-state.svelte');
    const old = deferred();
    api.fetchAuthStatus.mockReturnValueOnce(old.promise);
    const load = state.loadAuthSession('mfa');
    api.loginAuthSession.mockResolvedValueOnce(session('mfa', false, 'new-login'));
    await state.submitAuthLogin({ role: 'mfa', pin: '2468' });
    old.resolve({ ok: false, error: { status: 401, message: 'Unauthorized' } });
    await load;
    expect(state.staffAuthSlots.mfa.status).toBe('authenticated');
    expect(state.staffAuthSlots.mfa.user?.id).toBe('new-login');
  });

  it('does not overwrite a local PIN change with an older restricted status', async () => {
    const state = await import('./session-state.svelte');
    api.fetchAuthStatus.mockResolvedValueOnce(session('mfa', true));
    await state.loadAuthSession('mfa');
    const old = deferred();
    api.fetchAuthStatus.mockReturnValueOnce(old.promise);
    const refresh = state.refreshAuthSession('mfa');
    await Promise.resolve();
    state.staffAuthSlots.mfa.user = { ...state.staffAuthSlots.mfa.user!, pinChangeRequired: false };
    old.resolve(session('mfa', true));
    await refresh;
    expect(state.staffAuthSlots.mfa.user?.pinChangeRequired).toBe(false);
  });

  it('fetches again when another tab changes the PIN during an initial status request', async () => {
    const state = await import('./session-state.svelte');
    const old = deferred();
    api.fetchAuthStatus
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(session('mfa', false));
    const load = state.loadAuthSession('mfa');
    const refresh = state.refreshAuthSession('mfa');
    old.resolve(session('mfa', true));
    await load;
    await refresh;
    expect(api.fetchAuthStatus).toHaveBeenCalledTimes(2);
    expect(state.staffAuthSlots.mfa.user?.pinChangeRequired).toBe(false);
  });

  it('preserves the current view on a temporary refresh network failure', async () => {
    const state = await import('./session-state.svelte');
    api.fetchAuthStatus.mockResolvedValueOnce(session('mfa', false));
    await state.loadAuthSession('mfa');
    api.fetchAuthStatus.mockResolvedValueOnce({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'offline' },
    });
    await state.refreshAuthSession('mfa');
    expect(state.staffAuthSlots.mfa.status).toBe('authenticated');
  });
});

describe('pending staff actions', () => {
  async function authenticatedRoles() {
    const state = await import('./session-state.svelte');
    api.fetchAuthStatus
      .mockResolvedValueOnce(session('mfa', true, 'mfa-session'))
      .mockResolvedValueOnce(session('ops', true, 'ops-session'));
    await state.loadAuthSession('mfa');
    await state.loadAuthSession('ops');
    return state;
  }

  for (const role of ['mfa', 'ops'] as const) {
    it(`applies a delayed ${role} setup only to its submitted role`, async () => {
      const state = await authenticatedRoles();
      let finish!: (value: {
        ok: true;
        data: { ok: true; target: typeof role; updatedAt: string };
      }) => void;
      api.changeAuthPin.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      // Navigation can now select the other slot without changing the submitted action.
      const pending = state.submitAuthPinSetup({ role, currentPin: '0000', newPin: '2468' });
      const otherRole = role === 'mfa' ? 'ops' : 'mfa';
      const otherUser = state.staffAuthSlots[otherRole].user;
      finish({ ok: true, data: { ok: true, target: role, updatedAt: 'now' } });
      await pending;
      expect(api.changeAuthPin).toHaveBeenCalledWith({
        role,
        target: role,
        currentPin: '0000',
        newPin: '2468',
      });
      expect(state.staffAuthSlots[otherRole].user).toBe(otherUser);
      expect(state.staffAuthSlots[otherRole].user?.pinChangeRequired).toBe(true);
      expect(state.staffAuthSlots[role].status).toBe(
        role === 'ops' ? 'anonymous' : 'authenticated',
      );
      if (role === 'mfa') expect(state.staffAuthSlots.mfa.user?.pinChangeRequired).toBe(false);
    });

    for (const action of ['setup', 'logout'] as const) {
      it(`does not apply a delayed ${role} ${action} to a replacement session`, async () => {
        const state = await authenticatedRoles();
        let finish!: (value: { ok: true; data: { ok: true } }) => void;
        const response = new Promise((resolve) => {
          finish = resolve;
        });
        api.changeAuthPin.mockReturnValueOnce(response);
        api.logoutAuthSession.mockReturnValueOnce(response);
        const pending =
          action === 'setup'
            ? state.submitAuthPinSetup({ role, currentPin: '0000', newPin: '2468' })
            : state.submitAuthLogout(role);
        api.loginAuthSession.mockResolvedValueOnce(session(role, true, 'replacement'));
        await state.submitAuthLogin({ role, pin: '0000' });
        finish({ ok: true, data: { ok: true } });
        await pending;
        expect(state.staffAuthSlots[role].status).toBe('authenticated');
        expect(state.staffAuthSlots[role].user?.id).toBe('replacement');
        expect(state.staffAuthSlots[role].user?.pinChangeRequired).toBe(true);
      });
    }

    it(`logs out the submitted ${role} role without changing the other role`, async () => {
      const state = await authenticatedRoles();
      let finish!: (value: { ok: true; data: { ok: true } }) => void;
      api.logoutAuthSession.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const pending = state.submitAuthLogout(role);
      const otherRole = role === 'mfa' ? 'ops' : 'mfa';
      finish({ ok: true, data: { ok: true } });
      await pending;
      expect(state.staffAuthSlots[role].status).toBe('anonymous');
      expect(state.staffAuthSlots[otherRole].user?.pinChangeRequired).toBe(true);
    });
  }
});
