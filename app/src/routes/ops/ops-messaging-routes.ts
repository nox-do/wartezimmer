import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { PatchMessagingProviderBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { handleOpsRouteError } from './ops-errors.js';

export function registerOpsMessagingRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/ops/messaging/providers',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_messaging_providersResponse200,
        },
      },
    },
    async () => {
      return db.getMessagingProviderCatalog();
    },
  );

  app.patch<{ Params: { providerId: string }; Body: PatchMessagingProviderBody }>(
    '/api/v1/ops/messaging/providers/:providerId',
    {
      schema: {
        params: opsSchemas.PATCH_api_v1_ops_messaging_providers_providerId_Params,
        body: opsSchemas.PATCH_api_v1_ops_messaging_providers_providerId_RequestBody,
        response: {
          200: opsSchemas.PATCH_api_v1_ops_messaging_providers_providerId_Response200,
          400: opsSchemas.PATCH_api_v1_ops_messaging_providers_providerId_Response400,
        },
      },
    },
    async (request, reply) => {
      try {
        return db.updateMessagingProviderConfig(request.params.providerId, {
          enabled: request.body.enabled,
          credentials: request.body.credentials,
        });
      } catch (error) {
        const handled = handleOpsRouteError(reply, error, {
          unknownMessagingProviderMessage: 'Unbekannter Messaging-Provider.',
        });
        if (handled) {
          return;
        }
        throw error;
      }
    },
  );
}
