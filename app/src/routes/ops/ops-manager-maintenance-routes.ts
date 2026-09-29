import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { validateSettingsSnapshotForRestore } from '../../shared/settings/settings-snapshot-validate.js';
import {
  buildSettingsSnapshotImportReport,
  parseSkipProviderCredentialsQuery,
  withDefaultEnvForSnapshotParse,
} from '../../shared/settings/settings-snapshot-import.js';
import { SettingsSnapshotError } from '../../shared/settings/settings-snapshot-types.js';
import { createSerializedExecutor } from './ops-settings-routes.js';
import { parseDeviceAuthorizationCopyRows } from '../../shared/db/database-device-authorizations.js';
import {
  MAINTENANCE_API_PROTOCOL_VERSION,
  CURRENT_SETTINGS_FORMAT_VERSION,
} from '@praxis-flow/server-shared';
import { resolveStackVersion } from '../../shared/stack-version.js';

/**
 * Manager maintenance API on a separate listener (e.g. host loopback :8082 via Docker publish).
 * Not LAN-reachable. Every request additionally requires the installation-specific token.
 */
export function registerOpsManagerMaintenanceRoutes(
  app: FastifyInstance,
  db: CoreDatabase,
  maintenanceToken: string,
): void {
  if (!maintenanceToken.trim()) {
    throw new Error('MAINTENANCE_TOKEN is required');
  }

  app.addHook('onRequest', async (request, reply) => {
    const authorization = request.headers.authorization;
    const provided = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expectedBuffer = Buffer.from(maintenanceToken);
    const providedBuffer = Buffer.from(provided);
    const authorized =
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer);
    if (!authorized) {
      return reply
        .code(401)
        .send({ code: 'AUTH_REQUIRED', message: 'Maintenance token required.' });
    }
  });

  const serializeSettingsUpdate = createSerializedExecutor();

  app.get(
    '/api/v1/ops/maintenance/info',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_maintenance_infoResponse200,
        },
      },
    },
    async () => ({
      protocolVersion: MAINTENANCE_API_PROTOCOL_VERSION,
      stackVersion: resolveStackVersion(),
      snapshotExportFormatVersion: CURRENT_SETTINGS_FORMAT_VERSION,
      snapshotImportFormatVersions: [CURRENT_SETTINGS_FORMAT_VERSION],
    }),
  );

  app.get(
    '/api/v1/ops/settings/snapshot',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_settings_snapshotResponse200,
        },
      },
    },
    async () => db.exportSettingsDbSnapshot(),
  );

  app.post(
    '/api/v1/ops/settings/snapshot/validate',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_settings_snapshot_validateRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_settings_snapshot_validateResponse200,
        },
      },
    },
    async (request) => validateSettingsSnapshotForRestore(request.body),
  );

  app.post<{ Querystring: { skipProviderCredentials?: string } }>(
    '/api/v1/ops/settings/snapshot/import',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_settings_snapshot_importRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_settings_snapshot_importResponse200,
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

  app.post(
    '/api/v1/ops/device-authorizations/import',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_device_authorizations_importRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_device_authorizations_importResponse200,
          400: opsSchemas.POST_api_v1_ops_device_authorizations_importResponse400,
        },
      },
    },
    async (request, reply) => {
      const parsed = parseDeviceAuthorizationCopyRows(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: parsed.message,
        });
      }

      try {
        const imported = db.importActiveDeviceAuthorizations(parsed.rows);
        return { ok: true, imported };
      } catch (error) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: error instanceof Error ? error.message : 'Import failed.',
        });
      }
    },
  );
}
