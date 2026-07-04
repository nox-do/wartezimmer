import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { EmergencyAcknowledgeBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { handleOpsRouteError } from './ops-errors.js';
import { notifyEmergencyChanged } from '../../shared/ops/ops-emergency-events.js';

export function registerOpsEmergencyRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.post(
    '/api/v1/ops/emergency/raise',
    {
      schema: {
        response: {
          200: opsSchemas.POST_api_v1_ops_emergency_raiseResponse200,
          409: opsSchemas.POST_api_v1_ops_emergency_raiseResponse409,
        },
      },
    },
    async (request, reply) => {
      const source = request.clientRole === 'mfa' ? 'mfa' : 'terminal';
      try {
        const result = db.raiseEmergency(source);
        if (!result.alreadyActive) {
          notifyEmergencyChanged(db);
        }
        return result;
      } catch (error) {
        const handled = handleOpsRouteError(reply, error, {
          emergencyDisabledMessage: 'Notfall-Funktion ist in den Praxiseinstellungen deaktiviert.',
          checkinLockedMessage: 'Notfall kann bei gesperrtem Terminal nicht ausgeloest werden.',
        });
        if (handled) {
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Body: EmergencyAcknowledgeBody }>(
    '/api/v1/ops/emergency/ack',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_emergency_ackRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_emergency_ackResponse200,
          404: opsSchemas.POST_api_v1_ops_emergency_ackResponse404,
        },
      },
    },
    async (request, reply) => {
      try {
        const wasActive = db.getEmergencyState().active;
        const result = db.acknowledgeEmergency(request.body.emergencyId?.trim() ?? '');
        if (wasActive) {
          notifyEmergencyChanged(db);
        }
        return result;
      } catch (error) {
        const handled = handleOpsRouteError(reply, error, {
          emergencyNotFoundMessage:
            'Der Notfall konnte nicht gefunden oder nicht bestaetigt werden.',
        });
        if (handled) {
          return;
        }
        throw error;
      }
    },
  );
}
