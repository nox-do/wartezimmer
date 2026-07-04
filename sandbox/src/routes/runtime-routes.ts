import type { FastifyInstance } from 'fastify';

export function registerRuntimeRoutes(app: FastifyInstance): void {
  app.post<{ Body: { reason?: string } }>('/internal/runtime/restart', async (request) => {
    const initiatedAt = new Date().toISOString();
    const reason = request.body?.reason?.trim();

    // Return first so callers can persist workflow success before restart happens.
    setTimeout(() => {
      app.log.warn(
        {
          reason: reason || 'unspecified',
          initiatedAt,
        },
        'Sandbox runtime restart requested; exiting process for container respawn.',
      );
      process.exit(0);
    }, 75);

    return {
      status: 'restarting',
      initiatedAt,
      reason: reason || undefined,
    };
  });
}
