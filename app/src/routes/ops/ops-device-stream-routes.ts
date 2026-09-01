import type { FastifyInstance } from 'fastify';
import type { ClientRole } from '../../auth/client-auth.js';
import { withDeviceGrantSetCookie } from '../../auth/staff-session-auth.js';
import type { CoreDatabase } from '../../shared/db/database.js';
import {
  markDeviceStreamConnected,
  markDeviceStreamDisconnected,
  recordDevicePresence,
} from '../../shared/ops/device-presence-registry.js';
import {
  defaultDeviceIdForPairedRole,
  deviceKindForPairedRole,
} from '../../shared/ops/device-role.js';
import { SSE_PING_MS } from '../../shared/ops/stream-constants.js';

function deviceKindForRole(role: ClientRole): 'tv' | 'terminal' | null {
  if (role === 'tv' || role === 'terminal') {
    return deviceKindForPairedRole(role);
  }
  return null;
}

export function registerOpsDeviceStreamRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get('/api/v1/ops/device/stream', async (request, reply) => {
    const role = request.clientRole;
    const kind = role ? deviceKindForRole(role) : null;
    if (!role || !kind) {
      return reply.code(403).send({ code: 'AUTH_FORBIDDEN', message: 'Forbidden.' });
    }

    const deviceId =
      request.authSession?.kind === 'device'
        ? request.authSession.deviceId
        : defaultDeviceIdForPairedRole(kind);

    reply.hijack();
    reply.raw.writeHead(
      200,
      withDeviceGrantSetCookie(request, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      }),
    );

    let cleanedUp = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      if (pingTimer) {
        clearInterval(pingTimer);
      }
      markDeviceStreamDisconnected(deviceId);
    };

    recordDevicePresence({ deviceId, kind });
    markDeviceStreamConnected({ deviceId, kind });

    try {
      reply.raw.write(': connected\n\n');
    } catch {
      cleanup();
      return;
    }

    pingTimer = setInterval(() => {
      if (reply.raw.writableEnded || reply.raw.destroyed) {
        return;
      }

      if (request.authSession?.kind === 'device') {
        const grant = db.getDeviceAuthorizationById(request.authSession.sessionId);
        if (!grant || grant.revokedAt) {
          cleanup();
          reply.raw.end();
          return;
        }
      }

      recordDevicePresence({ deviceId, kind });
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        // connection closed
      }
    }, SSE_PING_MS);

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
    request.raw.on('aborted', cleanup);
  });
}
