import type { FastifyInstance } from 'fastify';
import type { DevicePresenceBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { recordDevicePresence } from '../../shared/ops/device-presence-registry.js';
import {
  defaultDeviceIdForPairedRole,
  deviceKindForPairedRole,
} from '../../shared/ops/device-role.js';

export function registerOpsDeviceRoutes(app: FastifyInstance): void {
  app.post<{ Body: DevicePresenceBody }>(
    '/api/v1/ops/device/presence',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_device_presenceRequestBody,
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (request, reply) => {
      const role = request.clientRole;
      if (role !== 'tv' && role !== 'terminal') {
        return reply.code(403).send({ code: 'AUTH_FORBIDDEN', message: 'Forbidden.' });
      }

      const deviceId =
        request.authSession?.kind === 'device'
          ? request.authSession.deviceId
          : defaultDeviceIdForPairedRole(role);

      recordDevicePresence({
        deviceId,
        kind: deviceKindForPairedRole(role),
        clientTime: request.body.clientTime,
        lastRevision: request.body.lastRevision,
      });

      return reply.code(204).send();
    },
  );
}
