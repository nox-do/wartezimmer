import type { FastifyInstance } from 'fastify';
import { SANDBOX_RUNTIME_INSTANCE_ID } from '../runtime-instance.js';

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
      instanceId: SANDBOX_RUNTIME_INSTANCE_ID,
      initiatedAt,
      reason: reason || undefined,
    };
  });
}
