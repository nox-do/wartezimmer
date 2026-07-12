import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { getCoreDatabase } from './shared/db/database.js';
import { registerOpsManagerMaintenanceRoutes } from './routes/ops/ops-manager-maintenance-routes.js';
import { resolveDomainError } from './http/domain-error-mapper.js';
import { buildFastifyLoggerOptions } from '@praxis-flow/server-shared';

export async function buildMaintenanceApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildFastifyLoggerOptions(),
  });

  const db = getCoreDatabase();

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && 'validation' in error) {
      const validationError = error as FastifyError;
      if (validationError.validation) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'Request validation failed.',
          details: validationError.validation,
        });
      }
    }

    app.log.error(error);
    const resolved = resolveDomainError(error);
    if (resolved?.http) {
      return reply.code(resolved.http.status).send({
        code: resolved.http.code,
        message: resolved.http.message,
      });
    }

    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
    });
  });

  registerOpsManagerMaintenanceRoutes(app, db);

  return app;
}
