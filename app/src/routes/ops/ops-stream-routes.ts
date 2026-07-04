import type { FastifyInstance } from 'fastify';
import type { StaffSessionManager } from '../../auth/staff-session-auth.js';
import type { CoreDatabase } from '../../shared/db/database.js';
import {
  currentDevicePairingSnapshot,
  pruneExpiredPairings,
} from '../../shared/ops/device-pairing-registry.js';
import {
  listDevicePresence,
  refreshKnownDevicePresence,
} from '../../shared/ops/device-presence-registry.js';
import { currentOpsRevision, subscribeOpsStream } from '../../shared/ops/ops-event-hub.js';
import { buildEmergencySnapshot } from '../../shared/ops/ops-emergency-events.js';
import { OPS_TICK_MS, SSE_PING_MS } from '../../shared/ops/stream-constants.js';

function buildInitialPresenceEvents() {
  const presenceById = new Map(listDevicePresence().map((entry) => [entry.deviceId, entry]));

  return [...presenceById.values()].flatMap((entry) => {
    if (entry.kind !== 'tv' && entry.kind !== 'terminal' && entry.kind !== 'room-panel') {
      return [];
    }

    return [
      {
        type: 'device.presence' as const,
        payload: {
          revision: currentOpsRevision('device.presence'),
          deviceId: entry.deviceId,
          kind: entry.kind,
          status: entry.status,
          streamConnected: entry.streamConnected,
          lastSeenAt: entry.lastSeenAt,
          serverTime: new Date().toISOString(),
        },
      },
    ];
  });
}

export function registerOpsStreamRoutes(
  app: FastifyInstance,
  db: CoreDatabase,
  sessions: StaffSessionManager,
): void {
  app.get('/api/v1/ops/stream', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let closed = false;

    const writeEvent = (event: string, data: unknown) => {
      if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
        return;
      }

      try {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        closed = true;
      }
    };

    writeEvent('emergency', buildEmergencySnapshot(db));

    for (const event of buildInitialPresenceEvents()) {
      writeEvent(event.type, event.payload);
    }

    writeEvent('device.pairing', currentDevicePairingSnapshot('tv'));
    writeEvent('device.pairing', currentDevicePairingSnapshot('terminal'));

    const unsubscribe = subscribeOpsStream((event) => {
      writeEvent(event.type, event.payload);
    });
    let unsubscribeRevocation: () => void = () => undefined;

    const tickTimer = setInterval(() => {
      pruneExpiredPairings();
      refreshKnownDevicePresence();
    }, OPS_TICK_MS);

    const pingTimer = setInterval(() => {
      if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
        return;
      }

      try {
        reply.raw.write(': ping\n\n');
      } catch {
        closed = true;
      }
    }, SSE_PING_MS);

    const cleanup = () => {
      closed = true;
      clearInterval(tickTimer);
      clearInterval(pingTimer);
      unsubscribe();
      unsubscribeRevocation();
    };
    if (request.authSession) {
      unsubscribeRevocation = sessions.subscribeSessionRevocation(
        request.authSession.sessionId,
        () => {
          cleanup();
          reply.raw.end();
        },
      );
    }

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  });
}
