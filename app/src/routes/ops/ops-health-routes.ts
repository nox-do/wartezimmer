import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { SILENT_ROUTE_LOG } from '@praxis-flow/server-shared';

export function registerOpsHealthRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/ops/health',
    {
      ...SILENT_ROUTE_LOG,
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_healthResponse200,
        },
      },
    },
    async () => {
      return {
        status: 'ok',
        service: 'app',
        timestamp: new Date().toISOString(),
      };
    },
  );

  app.get(
    '/api/v1/ops/patient-locales',
    {
      ...SILENT_ROUTE_LOG,
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_patient_localesResponse200,
        },
      },
    },
    async () => {
      const settings = db.getOpsSettings();
      return {
        terminalPatientLocales: settings.terminalPatientLocales,
        portalEnabled: db.isPortalEnabled(),
      };
    },
  );

  app.get(
    '/api/v1/ops/heartbeat',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_heartbeatResponse200,
        },
      },
    },
    async () => {
      const ops = db.getOpsState();
      const settings = db.getOpsSettings();
      const emergency = db.getEmergencyState();
      return {
        status: 'ok',
        service: 'app',
        serverTime: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        checkinLocked: db.isEffectiveCheckinLocked(),
        dayClosePhase: ops.dayClosePhase,
        emergencyEnabled: settings.emergencyEnabled,
        terminalWlanPromoEnabled: settings.terminalWlanPromoEnabled,
        terminalAuthPhoneEnabled: settings.terminalAuthPhoneEnabled,
        terminalAuthNameDobEnabled: settings.terminalAuthNameDobEnabled,
        terminalAuthEgkEnabled: settings.terminalAuthEgkEnabled,
        terminalPatientLocales: settings.terminalPatientLocales,
        emergencyActive: emergency.active,
      };
    },
  );
}
