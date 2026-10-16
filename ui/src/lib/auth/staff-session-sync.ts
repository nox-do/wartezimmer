import type { StaffAuthRole } from './session-client';

const SESSION_CHANGE_KEY = 'pf_staff_session_changed';

export function notifyStaffSessionChanged(role: StaffAuthRole): void {
  if (typeof window === 'undefined') return;
  try {
    // Only an invalidation hint crosses tabs; credentials and session data stay on the server.
    window.localStorage.setItem(
      SESSION_CHANGE_KEY,
      JSON.stringify({ role, nonce: `${Date.now()}:${Math.random()}` }),
    );
  } catch {
    // Focus/visibility refresh also works when browser storage is unavailable.
  }
}

export function mountStaffSessionSync(refresh: (role: StaffAuthRole) => void): () => void {
  const refreshVisible = () => {
    if (document.visibilityState !== 'visible') return;
    refresh('mfa');
    refresh('ops');
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_CHANGE_KEY || !event.newValue) return;
    try {
      const { role } = JSON.parse(event.newValue);
      if (role === 'mfa' || role === 'ops') refresh(role);
    } catch {
      // Ignore unrelated or malformed storage values.
    }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', refreshVisible);
    document.removeEventListener('visibilitychange', refreshVisible);
  };
}
