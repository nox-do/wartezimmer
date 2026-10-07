import type { FastifyInstance } from 'fastify';
import type { ScannerService } from '../scanner-service.js';
import { SILENT_ROUTE_LOG } from '@wartezimmer/server-shared/logger';
import { SANDBOX_RUNTIME_INSTANCE_ID } from '../runtime-instance.js';

export function registerHealthRoutes(app: FastifyInstance, scanner: ScannerService): void {
  app.get('/internal/health/live', SILENT_ROUTE_LOG, async () => {
    return {
      status: 'live',
      service: 'sandbox',
      instanceId: SANDBOX_RUNTIME_INSTANCE_ID,
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/internal/health/ready', SILENT_ROUTE_LOG, async () => {
    const scannerStatus = await scanner.readStatus();
    return {
      status: scannerStatus.ready ? 'ready' : 'degraded',
      service: 'sandbox',
      instanceId: SANDBOX_RUNTIME_INSTANCE_ID,
      scanner: scannerStatus,
      timestamp: new Date().toISOString(),
    };
  });
}
