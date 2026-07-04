import type { FastifyInstance } from 'fastify';
import type { SandboxConfig } from '../sandbox-config.js';
import type { ScannerService } from '../scanner-service.js';
import { isExecFileFailure } from '../type-guards.js';

export function registerScannerRoutes(
  app: FastifyInstance,
  config: Pick<SandboxConfig, 'scanEnabled'>,
  scanner: ScannerService,
): void {
  app.get('/internal/scanner/status', async () => {
    const scannerStatus = await scanner.readStatus();
    return {
      scanner: scannerStatus,
      timestamp: new Date().toISOString(),
    };
  });

  app.post('/internal/scanner/update', async (request, reply) => {
    if (!config.scanEnabled) {
      return {
        enabled: false,
        updated: false,
        message: 'Scanner is disabled.',
        scanner: await scanner.readStatus(),
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const result = await scanner.updateSignatures();
      return {
        enabled: true,
        updated: true,
        output: `${result.stdout}\n${result.stderr}`.trim(),
        scanner: await scanner.readStatus(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const output = isExecFileFailure(error)
        ? `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim()
        : '';
      request.log.warn(
        {
          outputTail: output.slice(-500) || undefined,
          error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        },
        'Sandbox scanner signature update failed',
      );
      return reply.code(502).send({
        code: 'SANDBOX_SCANNER_UPDATE_FAILED',
        message: 'Scanner signature update failed.',
        details: { output },
      });
    }
  });
}
