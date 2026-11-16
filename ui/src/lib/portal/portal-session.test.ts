import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/navigation/kit-paths', () => ({ replaceStateResolved: vi.fn() }));
vi.mock('$lib/i18n/i18nStore.svelte', () => ({ t: (key: string) => key }));
vi.mock('$lib/portal/session-api', () => ({
  resolvePortalSession: vi.fn(),
  fetchPortalSessionMe: vi.fn(),
}));

const context = { sessionToken: 'test-token', ticketCode: 'A-042', visitId: 'test-visit' };
const keys = ['portal:session-token', 'portal:ticket-code', 'portal:ticket-id'];
let values: Map<string, string>;
let storage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};
const denied = () => {
  throw new DOMException('Denied', 'SecurityError');
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  values = new Map();
  storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
  vi.stubGlobal('sessionStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('portal session storage', () => {
  it('stores and reads the complete context and clears it', async () => {
    const session = await import('./portal-session');
    await expect(session.activatePortalSession(context)).resolves.toEqual(context);
    expect(session.readPortalSession()).toEqual(context);
    session.clearPortalSession();
    expect(session.readPortalSession()).toBeNull();
    expect(values.size).toBe(0);
  });

  it.each(keys)('reports a denied read of %s', async (blockedKey) => {
    const session = await import('./portal-session');
    session.storePortalSession(context);
    storage.getItem.mockImplementation((key: string) =>
      key === blockedKey ? denied() : values.get(key),
    );
    expect(() => session.readPortalSession()).toThrow(session.PortalSessionStorageError);
  });

  it('reports a denied sessionStorage getter', async () => {
    const session = await import('./portal-session');
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: denied });
    expect(() => session.readPortalSession()).toThrow(session.PortalSessionStorageError);
    await expect(session.activatePortalSession(context)).rejects.toThrow(
      session.PortalSessionStorageError,
    );
    expect(() => session.clearPortalSession()).not.toThrow();
  });

  it.each(keys)('rejects partial activation when writing %s is denied', async (blockedKey) => {
    const session = await import('./portal-session');
    session.storePortalSession(context);
    storage.setItem.mockImplementation((key: string, value: string) => {
      if (key === blockedKey) denied();
      values.set(key, value);
    });
    await expect(
      session.activatePortalSession({ ...context, sessionToken: 'replacement' }),
    ).rejects.toThrow(session.PortalSessionStorageError);
    expect(session.readPortalSession()).toBeNull();
    expect(values.size).toBe(0);
  });

  it('keeps a cleared session invalid when removals fail and permits fresh activation', async () => {
    const session = await import('./portal-session');
    session.storePortalSession(context);
    storage.removeItem.mockImplementation(denied);
    expect(() => session.clearPortalSession()).not.toThrow();
    expect(storage.removeItem).toHaveBeenCalledWith(keys[2]);
    expect(session.readPortalSession()).toBeNull();
    await expect(session.activatePortalSession(context)).rejects.toThrow(
      session.PortalSessionStorageError,
    );
    storage.removeItem.mockImplementation((key: string) => {
      values.delete(key);
    });
    await session.activatePortalSession(context);
    expect(session.readPortalSession()).toEqual(context);
  });

  it('never returns an incomplete session', async () => {
    const session = await import('./portal-session');
    values.set(keys[0], context.sessionToken);
    expect(session.readPortalSession()).toBeNull();
  });
});

describe('portal bootstrap storage failures and expiry', () => {
  it('returns a recoverable error on denied reads without requesting session data', async () => {
    storage.getItem.mockImplementation(denied);
    const { ensurePortalSession } = await import('./ensure-portal-session');
    const api = await import('./session-api');
    await expect(ensurePortalSession(null)).resolves.toEqual({
      ok: false,
      errorMessage: 'portal.sessionStorageUnavailable',
    });
    expect(api.fetchPortalSessionMe).not.toHaveBeenCalled();
  });

  it('does not navigate on a denied write and succeeds after storage is restored', async () => {
    const { ensurePortalSession } = await import('./ensure-portal-session');
    const { resolvePortalSession } = await import('./session-api');
    const { replaceStateResolved } = await import('$lib/navigation/kit-paths');
    vi.mocked(resolvePortalSession).mockResolvedValue({
      ok: true,
      data: {
        sessionToken: context.sessionToken,
        visitId: context.visitId,
      },
    } as Awaited<ReturnType<typeof resolvePortalSession>>);
    storage.setItem.mockImplementationOnce(denied);
    await expect(ensurePortalSession('A-042', { replacePath: '/portal/menu' })).resolves.toEqual({
      ok: false,
      errorMessage: 'portal.sessionStorageUnavailable',
    });
    expect(replaceStateResolved).not.toHaveBeenCalled();
    await expect(ensurePortalSession('A-042', { replacePath: '/portal/menu' })).resolves.toEqual({
      ok: true,
      session: context,
    });
    expect(replaceStateResolved).toHaveBeenCalledWith('/portal/menu', {});
  });

  it.each(['active', 'expired', 'unauthorized'])(
    'revalidates stored sessions: %s',
    async (status) => {
      const session = await import('./portal-session');
      session.storePortalSession(context);
      const { fetchPortalSessionMe } = await import('./session-api');
      vi.mocked(fetchPortalSessionMe).mockResolvedValue(
        status === 'unauthorized'
          ? { ok: false, error: { message: 'Unauthorized' } }
          : ({ ok: true, data: { status } } as Awaited<ReturnType<typeof fetchPortalSessionMe>>),
      );
      storage.removeItem.mockImplementation(denied);
      const { ensurePortalSession } = await import('./ensure-portal-session');
      const result = await ensurePortalSession(null);
      expect(fetchPortalSessionMe).toHaveBeenCalledWith(context.sessionToken);
      if (status === 'active') {
        expect(result).toEqual({ ok: true, session: context });
      } else {
        expect(result).toEqual({ ok: false, errorMessage: 'portal.sessionExpired' });
        expect(session.readPortalSession()).toBeNull();
      }
    },
  );
});
