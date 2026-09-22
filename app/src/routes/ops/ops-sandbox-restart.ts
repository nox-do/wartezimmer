import type { FastifyInstance } from 'fastify';
import { getSandboxClient, type SandboxClient } from '../../shared/sandbox/sandbox-client.js';

type DayResetPurgeClient = Pick<SandboxClient, 'purgeIntakeDay'>;
type DayResetRestartClient = Pick<SandboxClient, 'requestRuntimeRestart' | 'getRuntimeInstanceId'>;

export async function purgeSandboxIntakeForDayReset(
  app: FastifyInstance,
  trigger: string,
  sandbox: DayResetPurgeClient = getSandboxClient(),
): Promise<void> {
  try {
    await sandbox.purgeIntakeDay(`day-reset:${trigger}`);
  } catch (error) {
    app.log.error(
      {
        trigger,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      },
      'Sandbox intake purge failed; day reset remains incomplete.',
    );
    throw error;
  }
}

export async function requestSandboxRestartForDayReset(
  app: FastifyInstance,
  trigger: string,
  sandbox: DayResetRestartClient = getSandboxClient(),
): Promise<boolean> {
  try {
    const previous = await sandbox.requestRuntimeRestart(`day-reset:${trigger}`);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      try {
        const currentInstanceId = await sandbox.getRuntimeInstanceId();
        if (currentInstanceId !== previous.instanceId) {
          return true;
        }
      } catch {
        // Expected while the container is between process instances.
      }
    }
    throw new Error('SANDBOX_RUNTIME_RESTART_FAILED:INSTANCE_UNCHANGED');
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
