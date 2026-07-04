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

export const authSession = $state<AuthSessionState>({
  status: 'idle',
  user: null,
  errorMessage: null,
});

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

export async function loadAuthSession(): Promise<void> {
  authSession.status = 'loading';
  authSession.errorMessage = null;

  const result = await fetchAuthStatus();
  if (!result.ok) {
    if (result.error.status === 401 || result.error.code === 'AUTH_UNAUTHORIZED') {
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
