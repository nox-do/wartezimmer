import type { FastifyInstance } from 'fastify';
import { getSandboxClient } from '../../shared/sandbox/sandbox-client.js';

export async function requestSandboxRestartForDayReset(
  app: FastifyInstance,
  trigger: string,
): Promise<boolean> {
  try {
    const sandbox = getSandboxClient();
    await sandbox.purgeIntakeDay(`day-reset:${trigger}`).catch((error) => {
      app.log.warn(
        {
          trigger,
          error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        },
        'Sandbox intake purge failed before day reset.',
      );
    });
    await sandbox.requestRuntimeRestart(`day-reset:${trigger}`);
    return true;
  } catch (error) {
    app.log.warn(
      {
        trigger,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      },
      'Sandbox restart request failed after day reset.',
    );
    return false;
  }
}
