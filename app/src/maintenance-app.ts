import Fastify, { type FastifyInstance } from 'fastify';
import { getCoreDatabase } from './shared/db/database.js';
import { registerOpsManagerMaintenanceRoutes } from './routes/ops/ops-manager-maintenance-routes.js';
import { registerDefaultErrorHandler } from './http/default-error-handler.js';
import { buildFastifyLoggerOptions } from '@praxis-flow/server-shared';

export async function buildMaintenanceApp(): Promise<FastifyInstance> {
  const app = Fastify({
    ...buildFastifyLoggerOptions(),
  });

  const db = getCoreDatabase();

  registerDefaultErrorHandler(app);

  registerOpsManagerMaintenanceRoutes(app, db);

  return app;
}
