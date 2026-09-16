import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { toPracticeProfileResponse } from './ops/ops-settings-mapper.js';

const practiceProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'displayName',
    'street',
    'postalCode',
    'city',
    'phone',
    'email',
    'dataProtectionOfficer',
    'website',
  ],
  properties: {
    displayName: { type: 'string' },
    street: { type: 'string' },
    postalCode: { type: 'string' },
    city: { type: 'string' },
    phone: { type: 'string' },
    email: { type: 'string' },
    dataProtectionOfficer: { type: 'string' },
    website: { type: 'string' },
  },
} as const;

export function registerPortalConfigRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/portal/config',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['terminalPatientLocales', 'portalEnabled', 'practiceProfile'],
            properties: {
              terminalPatientLocales: {
                type: 'array',
                items: { type: 'string', enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'] },
              },
              portalEnabled: { type: 'boolean' },
              practiceProfile: practiceProfileSchema,
            },
          },
        },
      },
    },
    async () => {
      const settings = db.getOpsSettings();
      return {
        terminalPatientLocales: settings.terminalPatientLocales,
        portalEnabled: db.isPortalEnabled(),
        practiceProfile: toPracticeProfileResponse(settings.practiceProfileJson),
      };
    },
  );
}
