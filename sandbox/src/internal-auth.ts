import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SandboxConfig } from './sandbox-config.js';

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function registerInternalAuth(
  app: FastifyInstance,
  config: Pick<SandboxConfig, 'sandboxAuthEnabled' | 'sandboxInternalToken'>,
): void {
  app.addHook('preHandler', async (request, reply) => {
    if (!config.sandboxAuthEnabled) {
      return;
    }

    const routePath = request.routeOptions.url;
    if (!routePath) {
      return;
    }

    if (!routePath.startsWith('/internal/')) {
      return;
    }

    if (routePath === '/internal/health/live' || routePath === '/internal/health/ready') {
      return;
    }

    const providedToken = request.headers['x-internal-service-token'];
    if (typeof providedToken !== 'string' || providedToken.trim().length === 0) {
      request.log.warn(
        { routePath, clientIp: request.ip, statusCode: 401 },
        'Sandbox internal auth rejected: missing token',
      );
      return reply.code(401).send({
        code: 'SANDBOX_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    if (!safeEquals(providedToken, config.sandboxInternalToken)) {
      request.log.warn(
        { routePath, clientIp: request.ip, statusCode: 403 },
        'Sandbox internal auth rejected: invalid token',
      );
      return reply.code(403).send({
        code: 'SANDBOX_FORBIDDEN',
        message: 'Forbidden.',
      });
    }
  });
}
