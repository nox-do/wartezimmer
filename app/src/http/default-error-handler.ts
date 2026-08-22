import type { FastifyError, FastifyInstance } from 'fastify';
import { resolveDomainError } from './domain-error-mapper.js';

export function registerDefaultErrorHandler(app: FastifyInstance): void {
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
}
