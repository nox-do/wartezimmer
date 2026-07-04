import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { opsSchemas } from '../api/generated/ops.fastify-schemas.js';
import { toPracticeProfileResponse } from './ops/ops-settings-mapper.js';

export function registerPracticeRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/practice/profile',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_practice_profileResponse200,
        },
      },
    },
    async () => {
      const settings = db.getOpsSettings();
      return toPracticeProfileResponse(settings.practiceProfileJson);
    },
  );
}
