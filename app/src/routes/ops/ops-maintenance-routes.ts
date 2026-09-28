import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { RuntimeResetBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { RUNTIME_RESET_CONFIRM_PHRASE } from '../../shared/ops/runtime-reset-constants.js';
import { notifyEmergencyChanged } from '../../shared/ops/ops-emergency-events.js';
import { publishTvQueueUpdate } from '../../shared/queue/queue-stream-hub.js';
import { sendApiError } from '../../http/domain-error-mapper.js';
import { withSandboxIntakePaused } from '../../shared/sandbox/sandbox-intake-gate.js';
import { requestSandboxRestartForDayReset } from './ops-sandbox-restart.js';
import { purgeSandboxIntakeForDayReset } from './ops-sandbox-restart.js';
import { handleOpsRouteError } from './ops-errors.js';

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
          409: opsSchemas.POST_api_v1_ops_maintenance_runtime_resetResponse409,
          503: opsSchemas.POST_api_v1_ops_maintenance_runtime_resetResponse503,
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

      const recoveringUncertainPurge = db.isSandboxResetPending();
      db.beginSandboxReset();
      publishTvQueueUpdate(db);

      try {
        return await withSandboxIntakePaused(async () => {
          if (
            recoveringUncertainPurge &&
            !(await requestSandboxRestartForDayReset(app, 'runtime-reset-recovery'))
          ) {
            return sendApiError(reply, 503, {
              code: 'SANDBOX_UNAVAILABLE',
              message: 'Sandbox-Neustart konnte nicht bestätigt werden. Der Reset bleibt gesperrt.',
            });
          }
          try {
            await purgeSandboxIntakeForDayReset(app, 'runtime-reset');
          } catch {
            sendApiError(reply, 503, {
              code: 'SANDBOX_UNAVAILABLE',
              message:
                'Sandbox-Bereinigung fehlgeschlagen. Der Runtime-Reset wurde nicht abgeschlossen; Check-in bleibt gesperrt.',
            });
            return;
          }

          if (!(await requestSandboxRestartForDayReset(app, 'runtime-reset'))) {
            return sendApiError(reply, 503, {
              code: 'SANDBOX_UNAVAILABLE',
              message:
                'Sandbox-Neustart konnte nicht bestätigt werden. Der Reset bleibt gesperrt und kann erneut versucht werden.',
            });
          }
          const reset = db.executeRuntimeReset();
          if (reset.emergencyCleared) {
            notifyEmergencyChanged(db);
          }
          publishTvQueueUpdate(db);

          return {
            ...reset,
            sandboxRestartInitiated: true as const,
          };
        });
      } catch (error) {
        if (
          handleOpsRouteError(reply, error, {
            dayCloseInProgressMessage: 'Ein anderer Reset läuft bereits.',
          })
        ) {
          return;
        }
        throw error;
      }
    },
  );
}
