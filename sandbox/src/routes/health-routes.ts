import type { FastifyInstance } from 'fastify';
import type { ScannerService } from '../scanner-service.js';
import { SILENT_ROUTE_LOG } from '@praxis-flow/server-shared';

export function registerHealthRoutes(app: FastifyInstance, scanner: ScannerService): void {
  app.get('/internal/health/live', SILENT_ROUTE_LOG, async () => {
    return {
      status: 'live',
      service: 'sandbox',
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/internal/health/ready', SILENT_ROUTE_LOG, async () => {
    const scannerStatus = await scanner.readStatus();
    return {
      status: scannerStatus.ready ? 'ready' : 'degraded',
      service: 'sandbox',
      scanner: scannerStatus,
      timestamp: new Date().toISOString(),
    };
  });
}
