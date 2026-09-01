import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  AuthSession,
  RoomPanelSession,
  RoomPanelSessionRole,
  StaffRole,
  StaffSession,
  StaffSessionManager,
} from './staff-session-types.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createStaffSessionManager(options: {
  sessionTtlMs: number;
  sessionIdleTtlMs?: number;
}): StaffSessionManager {
  const sessionsByTokenHash = new Map<string, AuthSession>();
  const revocationListenersBySessionId = new Map<string, Set<() => void>>();
  const sessionIdleTtlMs = options.sessionIdleTtlMs ?? options.sessionTtlMs;

  function notifySessionRevoked(sessionId: string): void {
    const listeners = revocationListenersBySessionId.get(sessionId);
    revocationListenersBySessionId.delete(sessionId);
    for (const listener of listeners ?? []) {
      try {
        listener();
      } catch {
        // Session revocation must continue even if a disconnected stream listener fails.
      }
    }
  }

  function deleteSession(tokenHash: string, session: AuthSession): void {
    sessionsByTokenHash.delete(tokenHash);
    notifySessionRevoked(session.sessionId);
  }

  function idleExpiryFor(now: Date, absoluteExpiresAt: string): string {
    const idleExpiresAtMs = Math.min(
      now.getTime() + sessionIdleTtlMs,
      Date.parse(absoluteExpiresAt),
    );
    return new Date(idleExpiresAtMs).toISOString();
  }

  function pruneExpired(now: Date): void {
    const nowMs = now.getTime();
    for (const [tokenHash, session] of sessionsByTokenHash) {
      if (Date.parse(session.expiresAt) <= nowMs || Date.parse(session.idleExpiresAt) <= nowMs) {
        deleteSession(tokenHash, session);
      }
    }
  }

  function refreshActiveSession(
    session: AuthSession,
    tokenHash: string,
    now: Date,
  ): AuthSession | null {
    if (
      Date.parse(session.expiresAt) <= now.getTime() ||
      Date.parse(session.idleExpiresAt) <= now.getTime()
    ) {
      deleteSession(tokenHash, session);
      return null;
    }

    session.lastSeenAt = now.toISOString();
    session.idleExpiresAt = idleExpiryFor(now, session.expiresAt);
    return session;
  }

  return {
    createStaffSession(role: StaffRole, now = new Date()) {
      pruneExpired(now);
      const token = randomBytes(32).toString('base64url');
      const createdAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + options.sessionTtlMs).toISOString();
      const idleExpiresAt = idleExpiryFor(now, expiresAt);
      const session: StaffSession = {
        kind: 'staff',
        sessionId: randomUUID(),
        role,
        createdAt,
        lastSeenAt: createdAt,
        idleExpiresAt,
        expiresAt,
      };
      sessionsByTokenHash.set(sha256(token), session);
      return { token, session };
    },

    createRoomPanelSession(input, now = new Date()) {
      pruneExpired(now);
      const token = randomBytes(32).toString('base64url');
      const createdAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + options.sessionTtlMs).toISOString();
      const idleExpiresAt = idleExpiryFor(now, expiresAt);
      const session: RoomPanelSession = {
        kind: 'room-panel',
        sessionId: randomUUID(),
        role: 'room-panel',
        roomId: input.roomId,
        placement: input.placement,
        ...(input.clientKey ? { clientKey: input.clientKey } : {}),
        createdAt,
        lastSeenAt: createdAt,
        idleExpiresAt,
        expiresAt,
      };
      sessionsByTokenHash.set(sha256(token), session);
      return { token, session };
    },

    getSession(token: string | null, now = new Date()) {
      if (!token) {
        return null;
      }

      const session = sessionsByTokenHash.get(sha256(token));
      if (!session) {
        return null;
      }

      return refreshActiveSession(session, sha256(token), now);
    },

    refreshSession(sessionId: string, now = new Date()) {
      for (const [tokenHash, session] of sessionsByTokenHash) {
        if (session.sessionId === sessionId) {
          return refreshActiveSession(session, tokenHash, now);
        }
      }
      return null;
    },

    countRoomPanelSessions(input) {
      pruneExpired(new Date());
      return [...sessionsByTokenHash.values()].filter(
        (session) =>
          session.kind === 'room-panel' &&
          session.clientKey === input.clientKey &&
          (input.placement === undefined || session.placement === input.placement),
      ).length;
    },

    revokeSession(token: string | null) {
      if (token) {
        const tokenHash = sha256(token);
        const session = sessionsByTokenHash.get(tokenHash);
        if (session) {
          deleteSession(tokenHash, session);
        }
      }
    },

    revokeSessionsByRole(role: StaffRole | RoomPanelSessionRole, exceptSessionId?: string) {
      for (const [tokenHash, session] of sessionsByTokenHash) {
        if (session.role === role && session.sessionId !== exceptSessionId) {
          deleteSession(tokenHash, session);
        }
      }
    },

    revokeRoomPanelSessions(roomId: string, exceptSessionId?: string) {
      for (const [tokenHash, session] of sessionsByTokenHash) {
        if (
          session.kind === 'room-panel' &&
          session.roomId === roomId &&
          session.sessionId !== exceptSessionId
        ) {
          deleteSession(tokenHash, session);
        }
      }
    },

    revokeRoomPanelSessionsByPlacement(placement) {
      for (const [tokenHash, session] of sessionsByTokenHash) {
        if (session.kind === 'room-panel' && session.placement === placement) {
          deleteSession(tokenHash, session);
        }
      }
    },

    revokeRoomPanelSessionPlacement(roomId, placement, exceptSessionId) {
      for (const [tokenHash, session] of sessionsByTokenHash) {
        if (
          session.kind === 'room-panel' &&
          session.roomId === roomId &&
          session.placement === placement &&
          session.sessionId !== exceptSessionId
        ) {
          deleteSession(tokenHash, session);
        }
      }
    },

    subscribeSessionRevocation(sessionId: string, listener: () => void) {
      pruneExpired(new Date());
      const sessionIsActive = [...sessionsByTokenHash.values()].some(
        (session) => session.sessionId === sessionId,
      );
      if (!sessionIsActive) {
        listener();
        return () => undefined;
      }

      const listeners = revocationListenersBySessionId.get(sessionId) ?? new Set<() => void>();
      listeners.add(listener);
      revocationListenersBySessionId.set(sessionId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          revocationListenersBySessionId.delete(sessionId);
        }
      };
    },
  };
}
