import type { FastifyInstance } from 'fastify';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { DeviceAuthorizationRow } from '../../shared/db/database-device-authorizations.js';

type DeviceAuthorizationListItem = {
  authorizationId: string;
  role: 'tv' | 'terminal';
  deviceId: string;
  createdAt: string;
  lastSeenAt: string | null;
};

function toListItem(row: DeviceAuthorizationRow): DeviceAuthorizationListItem | null {
  if (row.role !== 'tv' && row.role !== 'terminal') {
    return null;
  }
  if (!row.deviceId) {
    return null;
  }
  return {
    authorizationId: row.authorizationId,
    role: row.role,
    deviceId: row.deviceId,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export function registerOpsDeviceAuthorizationRoutes(
  app: FastifyInstance,
  db: CoreDatabase,
): void {
  app.get(
    '/api/v1/ops/device-authorizations',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_device_authorizationsResponse200,
        },
      },
    },
    async () => ({
      authorizations: db
        .listActiveDeviceAuthorizations()
        .map(toListItem)
        .filter((row): row is DeviceAuthorizationListItem => row !== null),
    }),
  );

  app.post<{ Params: { authorizationId: string } }>(
    '/api/v1/ops/device-authorizations/:authorizationId/revoke',
    {
      schema: {
        params: opsSchemas.POST_api_v1_ops_device_authorizations_authorizationId_revokeParams,
        response: {
          200: opsSchemas.POST_api_v1_ops_device_authorizations_authorizationId_revokeResponse200,
          404: opsSchemas.POST_api_v1_ops_device_authorizations_authorizationId_revokeResponse404,
        },
      },
    },
    async (request, reply) => {
      const existing = db.getDeviceAuthorizationById(request.params.authorizationId);
      if (
        !existing ||
        existing.revokedAt ||
        (existing.role !== 'tv' && existing.role !== 'terminal')
      ) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Authorization not found.' });
      }
      db.revokeDeviceAuthorizationById(request.params.authorizationId);
      return { ok: true };
    },
  );
}
