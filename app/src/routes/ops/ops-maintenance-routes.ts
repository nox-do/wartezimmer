import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { RuntimeResetBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { RUNTIME_RESET_CONFIRM_PHRASE } from '../../shared/ops/runtime-reset-constants.js';
import { notifyEmergencyChanged } from '../../shared/ops/ops-emergency-events.js';
import { publishTvQueueUpdate } from '../../shared/queue/queue-stream-hub.js';
import { sendApiError } from '../../http/domain-error-mapper.js';
import { requestSandboxRestartForDayReset } from './ops-sandbox-restart.js';

export function registerOpsMaintenanceRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/ops/maintenance/runtime-reset/preview',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_maintenance_runtime_reset_previewResponse200,
        },
      },
    },
    async () => {
      return {
        ...db.getRuntimeResetPreview(),
        serverTime: new Date().toISOString(),
      };
    },
  );

  app.post<{ Body: RuntimeResetBody }>(
    '/api/v1/ops/maintenance/runtime-reset',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_maintenance_runtime_resetRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_maintenance_runtime_resetResponse200,
          400: opsSchemas.POST_api_v1_ops_maintenance_runtime_resetResponse400,
        },
      },
    },
    async (request, reply) => {
      const phrase = request.body.confirmPhrase.trim();
      if (phrase !== RUNTIME_RESET_CONFIRM_PHRASE) {
        return sendApiError(reply, 400, {
          code: 'INVALID_ARGUMENT',
          message: `Bestätigung fehlgeschlagen. Erwartet: ${RUNTIME_RESET_CONFIRM_PHRASE}`,
        });
      }

      const reset = db.executeRuntimeReset();
      if (reset.emergencyCleared) {
        notifyEmergencyChanged(db);
      }
      publishTvQueueUpdate(db);
      void requestSandboxRestartForDayReset(app, 'runtime-reset').then((restartOk) => {
        if (!restartOk) {
          app.log.warn('Sandbox restart after runtime-reset was not confirmed.');
        }
      });

      return {
        ...reset,
        sandboxRestartInitiated: true as const,
      };
    },
  );
}
