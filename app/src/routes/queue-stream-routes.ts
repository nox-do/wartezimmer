import type { FastifyInstance } from 'fastify';
import type { ClientRole } from '../auth/client-auth.js';
import type { StaffSessionManager } from '../auth/staff-session-auth.js';
import { withDeviceGrantSetCookie } from '../auth/staff-session-auth.js';
import type { CoreDatabase } from '../shared/db/database.js';
import {
  markDeviceStreamConnected,
  markDeviceStreamDisconnected,
  recordDevicePresence,
  WAITING_ROOM_DEVICE_ID,
} from '../shared/ops/device-presence-registry.js';
import { roomPanelDeviceId } from '../shared/ops/device-ids.js';
import {
  currentMfaQueueSnapshot,
  currentRoomPanelQueueSnapshot,
  currentTvQueueSnapshot,
  publishExpiredRecallWindows,
  subscribeMfaQueueStream,
  subscribeQueueStream,
  subscribeRoomPanelQueueStream,
} from '../shared/queue/queue-stream-hub.js';
import type { MfaQueueSnapshot } from '../shared/queue/mfa-queue-snapshot.js';
import type { RoomPanelQueueSnapshot } from '../shared/queue/room-panel-queue-snapshot.js';
import type { TvQueueSnapshot } from '../shared/queue/tv-queue-snapshot.js';
import { SSE_PING_MS } from '../shared/ops/stream-constants.js';
import { resolveRoomPanelForSession } from '../shared/room-panel/room-panel-policy.js';

function ssePingMs(): number {
  const fromEnv = Number.parseInt(process.env.PRAXIS_SSE_PING_MS ?? '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : SSE_PING_MS;
}

export function registerQueueStreamRoutes(
  app: FastifyInstance,
  db: CoreDatabase,
  sessions: StaffSessionManager,
): void {
  app.get<{ Querystring: { deviceId?: string } }>(
    '/api/v1/queue/stream',
    async (request, reply) => {
      const role: ClientRole = request.clientRole ?? 'tv';
      const deviceId =
        request.authSession?.kind === 'device'
          ? request.authSession.deviceId
          : request.query.deviceId?.trim() || WAITING_ROOM_DEVICE_ID;

      if (
        role === 'room-panel' &&
        (request.authSession?.kind !== 'room-panel' ||
          !resolveRoomPanelForSession(db, request.authSession))
      ) {
        return reply.code(403).send({
          code: 'AUTH_FORBIDDEN',
          message: 'Raum-Panel ist deaktiviert oder die Platzierung wurde geändert.',
        });
      }

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

      const writeEvent = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      if (role === 'room-panel' && request.authSession?.kind === 'room-panel') {
        const session = request.authSession;
        const panelDeviceId = roomPanelDeviceId(session.roomId, session.placement);
        recordDevicePresence({ deviceId: panelDeviceId, kind: 'room-panel' });
        markDeviceStreamConnected({ deviceId: panelDeviceId, kind: 'room-panel' });

        publishExpiredRecallWindows(db);
        writeEvent('snapshot', currentRoomPanelQueueSnapshot(db, session));

        const unsubscribe = subscribeRoomPanelQueueStream(
          session,
          (snapshot: RoomPanelQueueSnapshot) => {
            writeEvent('snapshot', snapshot);
          },
        );

        const pingTimer = setInterval(() => {
          const grant = db.getDeviceAuthorizationById(session.sessionId);
          if (
            !grant ||
            grant.revokedAt ||
            grant.role !== 'room-panel' ||
            !resolveRoomPanelForSession(db, session)
          ) {
            try {
              if (!reply.raw.writableEnded) {
                writeEvent('session-revoked', { code: 'SESSION_REVOKED' });
              }
            } finally {
              cleanup();
              reply.raw.end();
            }
            return;
          }
          db.touchDeviceAuthorization(session.sessionId);
          recordDevicePresence({ deviceId: panelDeviceId, kind: 'room-panel' });
          publishExpiredRecallWindows(db);
          reply.raw.write(': ping\n\n');
        }, ssePingMs());
        let cleanedUp = false;
        const cleanup = () => {
          if (cleanedUp) {
            return;
          }
          cleanedUp = true;
          clearInterval(pingTimer);
          markDeviceStreamDisconnected(panelDeviceId);
          unsubscribe();
        };

        request.raw.on('close', cleanup);
        request.raw.on('error', cleanup);
        return;
      }

      if (role === 'mfa') {
        const session = request.authSession;
        publishExpiredRecallWindows(db);
        writeEvent('snapshot', currentMfaQueueSnapshot(db));

        const unsubscribe = subscribeMfaQueueStream((snapshot: MfaQueueSnapshot) => {
          writeEvent('snapshot', snapshot);
        });

        const pingTimer = setInterval(() => {
          publishExpiredRecallWindows(db);
          reply.raw.write(': ping\n\n');
        }, ssePingMs());

        let cleanedUp = false;
        let unsubscribeRevocation: () => void = () => undefined;
        const cleanup = () => {
          if (cleanedUp) {
            return;
          }
          cleanedUp = true;
          clearInterval(pingTimer);
          unsubscribe();
          unsubscribeRevocation();
        };
        if (session) {
          unsubscribeRevocation = sessions.subscribeSessionRevocation(session.sessionId, () => {
            cleanup();
            reply.raw.end();
          });
        }

        request.raw.on('close', cleanup);
        request.raw.on('error', cleanup);
        return;
      }

      recordDevicePresence({ deviceId, kind: 'tv' });
      markDeviceStreamConnected({ deviceId, kind: 'tv' });

      publishExpiredRecallWindows(db);
      writeEvent('snapshot', currentTvQueueSnapshot(db));

      const unsubscribe = subscribeQueueStream((snapshot: TvQueueSnapshot) => {
        writeEvent('snapshot', snapshot);
      });

      let pingTimer: ReturnType<typeof setInterval>;
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        clearInterval(pingTimer);
        markDeviceStreamDisconnected(deviceId);
        unsubscribe();
      };

      pingTimer = setInterval(() => {
        if (request.authSession?.kind === 'device') {
          const grant = db.getDeviceAuthorizationById(request.authSession.sessionId);
          if (!grant || grant.revokedAt) {
            try {
              if (!reply.raw.writableEnded) {
                writeEvent('session-revoked', { code: 'SESSION_REVOKED' });
              }
            } finally {
              cleanup();
              reply.raw.end();
            }
            return;
          }
        }
        recordDevicePresence({ deviceId, kind: 'tv' });
        publishExpiredRecallWindows(db);
        reply.raw.write(': ping\n\n');
      }, ssePingMs());

      request.raw.on('close', cleanup);
      request.raw.on('error', cleanup);
    },
  );
}
