import type { FastifyInstance } from 'fastify';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onRequest', async (_request, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(name, value);
    }
  });
}
