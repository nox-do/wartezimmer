import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';

export function registerOpsOutboxRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/ops/outbox-status',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_outbox_statusResponse200,
        },
      },
    },
    async () => {
      return {
        ...db.getOutboxStatus(),
        serverTime: new Date().toISOString(),
      };
    },
  );
}
