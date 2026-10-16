// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountStaffSessionSync, notifyStaffSessionChanged } from './staff-session-sync';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('staff session synchronization', () => {
  it('publishes only a role and nonce, without credentials', () => {
    notifyStaffSessionChanged('mfa');
    const value = JSON.parse(window.localStorage.getItem('pf_staff_session_changed')!);
    expect(Object.keys(value).sort()).toEqual(['nonce', 'role']);
    expect(value.role).toBe('mfa');
  });

  it('refreshes the changed role in another tab and cleans up listeners', () => {
    const refresh = vi.fn();
    cleanup = mountStaffSessionSync(refresh);
    const changed = () =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'pf_staff_session_changed',
          newValue: JSON.stringify({ role: 'mfa', nonce: '1' }),
        }),
      );
    changed();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('mfa');
    cleanup();
    refresh.mockClear();
    changed();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes on focus and visible tab activation, even when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => notifyStaffSessionChanged('ops')).not.toThrow();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const refresh = vi.fn();
    cleanup = mountStaffSessionSync(refresh);
    window.dispatchEvent(new Event('focus'));
    expect(refresh.mock.calls).toEqual([['mfa'], ['ops']]);
    refresh.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh.mock.calls).toEqual([['mfa'], ['ops']]);
  });

  it('ignores hidden tabs and malformed or unrelated storage events', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const refresh = vi.fn();
    cleanup = mountStaffSessionSync(refresh);
    window.dispatchEvent(new Event('focus'));
    for (const value of ['broken', '{"role":"terminal"}', 'null']) {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'pf_staff_session_changed', newValue: value }),
      );
    }
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: '{"role":"ops"}' }));
    expect(refresh).not.toHaveBeenCalled();
  });
});
