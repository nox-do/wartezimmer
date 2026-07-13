import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { PatchOpsSettingsBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import {
  opsSettingsInvalidHttpStatus,
  opsSettingsInvalidResponse,
} from '../../shared/db/ops-settings-errors.js';
import { buildOpsSettingsUpdate, toOpsSettingsResponse } from './ops-settings-mapper.js';
import { validateSettingsSnapshotForRestore } from '../../shared/settings/settings-snapshot-validate.js';
import {
  buildSettingsSnapshotImportReport,
  parseSkipProviderCredentialsQuery,
  withDefaultEnvForSnapshotParse,
} from '../../shared/settings/settings-snapshot-import.js';
import { SettingsSnapshotError } from '../../shared/settings/settings-snapshot-types.js';
import { createSerializedExecutor } from './ops-settings-routes.js';

/**
 * Manager maintenance API on a separate listener (e.g. host loopback :8082 via Docker publish).
 * Not LAN-reachable; intra-compose access to 0.0.0.0:8082 is possible and accepted for this stack.
 * No session auth — Setup reaches it from the host only.
 */
export function registerOpsManagerMaintenanceRoutes(app: FastifyInstance, db: CoreDatabase): void {
  const serializeSettingsUpdate = createSerializedExecutor();

  app.get(
    '/api/v1/ops/settings/capabilities',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_settings_capabilitiesResponse200,
        },
      },
    },
    async () => db.getRoutingCapabilities(),
  );

  app.get('/api/v1/ops/settings/snapshot', async () => db.exportSettingsDbSnapshot());

  app.post('/api/v1/ops/settings/snapshot/validate', async (request) =>
    validateSettingsSnapshotForRestore(request.body),
  );

  app.post<{ Querystring: { skipProviderCredentials?: string } }>(
    '/api/v1/ops/settings/snapshot/import',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            skipProviderCredentials: { type: 'string', enum: ['true', 'false'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const skipQuery = parseSkipProviderCredentialsQuery(request.query.skipProviderCredentials);
      if (!skipQuery.ok) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: skipQuery.message,
        });
      }

      const snapshotBody = withDefaultEnvForSnapshotParse(request.body);

      return serializeSettingsUpdate(async () => {
        try {
          const result = db.importSettingsSnapshot(snapshotBody, {
            skipProviderCredentials: skipQuery.skipProviderCredentials,
          });
          return buildSettingsSnapshotImportReport(result.snapshot, {
            skipProviderCredentials: result.skipProviderCredentials,
            disabledProviderIds: result.disabledProviderIds,
          });
        } catch (error) {
          if (error instanceof SettingsSnapshotError) {
            return reply.code(400).send({
              ok: false,
              code: error.code,
              errors: [error.message],
            });
          }
          throw error;
        }
      });
    },
  );

  app.patch<{ Body: PatchOpsSettingsBody }>(
    '/api/v1/ops/settings',
    {
      schema: {
        body: opsSchemas.PATCH_api_v1_ops_settingsRequestBody,
        response: {
          200: opsSchemas.PATCH_api_v1_ops_settingsResponse200,
          400: opsSchemas.PATCH_api_v1_ops_settingsResponse400,
          403: opsSchemas.PATCH_api_v1_ops_settingsResponse403,
          409: opsSchemas.PATCH_api_v1_ops_settingsResponse409,
        },
      },
    },
    async (request, reply) => {
      const keys = Object.keys(request.body ?? {}).filter(
        (key) => request.body[key as keyof typeof request.body] !== undefined,
      );
      if (keys.length !== 1 || keys[0] !== 'routingMode') {
        return reply.code(403).send({
          code: 'AUTH_FORBIDDEN',
          message: 'Maintenance API may only patch routingMode.',
        });
      }

      return serializeSettingsUpdate(async () => {
        const patch = await buildOpsSettingsUpdate(db, request.body);
        if ('code' in patch) {
          return reply.code(400).send(patch);
        }

        try {
          const updated = db.updateOpsSettings(patch);
          return toOpsSettingsResponse(updated);
        } catch (error) {
          const invalid = opsSettingsInvalidResponse(error);
          if (invalid) {
            return reply.code(opsSettingsInvalidHttpStatus(invalid.code)).send({
              code: invalid.code,
              message: invalid.message,
              ...(invalid.details ? { details: invalid.details } : {}),
            });
          }
          throw error;
        }
      });
    },
  );
}
