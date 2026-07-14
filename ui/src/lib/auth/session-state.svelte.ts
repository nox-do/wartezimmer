import {
  fetchAuthStatus,
  loginAuthSession,
  type AuthLoginRequest,
  type AuthSessionUser,
} from './session-client';

export type AuthSessionState = {
  status: 'idle' | 'loading' | 'authenticated' | 'anonymous' | 'error';
  user: AuthSessionUser | null;
  errorMessage: string | null;
};

export type StaffAuthRole = Extract<AuthSessionUser['roles'][number], 'mfa' | 'ops'>;

export const authSession = $state<AuthSessionState>({
  status: 'idle',
  user: null,
  errorMessage: null,
});

let inflightLoad: Promise<void> | null = null;
let inflightLoadRole: StaffAuthRole | null = null;

function applyAnonymous(message: string | null = null) {
  authSession.status = 'anonymous';
  authSession.user = null;
  authSession.errorMessage = message;
}

function userFromSession(session: {
  sessionId: string;
  role: AuthSessionUser['roles'][number];
}): AuthSessionUser {
  return {
    id: session.sessionId,
    roles: [session.role],
  };
}

export function markAuthUnauthorized(message: string | null = null) {
  applyAnonymous(message);
}

export function shouldLoadAuthSession(role: StaffAuthRole): boolean {
  if (authSession.status === 'loading') {
    return false;
  }
  if (authSession.status === 'idle') {
    return true;
  }
  if (authSession.status === 'authenticated') {
    return !authSession.user?.roles.includes(role);
  }
  return false;
}

export async function loadAuthSession(role: StaffAuthRole): Promise<void> {
  if (!shouldLoadAuthSession(role)) {
    return;
  }
  if (inflightLoad && inflightLoadRole === role) {
    await inflightLoad;
    return;
  }

  inflightLoadRole = role;
  inflightLoad = loadAuthSessionInternal(role);
  try {
    await inflightLoad;
  } finally {
    inflightLoad = null;
    inflightLoadRole = null;
  }
}

async function loadAuthSessionInternal(role: StaffAuthRole): Promise<void> {
  const priorUser = authSession.user;
  const probingAlternateSlot =
    authSession.status === 'authenticated' &&
    priorUser != null &&
    !priorUser.roles.includes(role);

  authSession.status = 'loading';
  authSession.errorMessage = null;

  const result = await fetchAuthStatus(role);
  if (!result.ok) {
    if (result.error.status === 401 || result.error.code === 'AUTH_UNAUTHORIZED') {
      if (probingAlternateSlot && priorUser) {
        authSession.status = 'authenticated';
        authSession.user = priorUser;
        authSession.errorMessage = null;
        return;
      }
      applyAnonymous();
      return;
    }

    authSession.status = 'error';
    authSession.user = null;
    authSession.errorMessage = result.error.message;
    return;
  }

  authSession.status = 'authenticated';
  authSession.user = userFromSession(result.data);
  authSession.errorMessage = null;
}

export async function submitAuthLogin(payload: AuthLoginRequest): Promise<boolean> {
  authSession.status = 'loading';
  authSession.errorMessage = null;

  const result = await loginAuthSession(payload);
  if (!result.ok) {
    applyAnonymous(result.error.message);
    return false;
  }

  authSession.status = 'authenticated';
  authSession.user = userFromSession(result.data);
  authSession.errorMessage = null;
  return true;
}
