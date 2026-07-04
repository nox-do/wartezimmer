import Fastify, { type FastifyInstance } from 'fastify';
import { registerInternalAuth } from './internal-auth.js';
import { createPreviewStore } from './preview-store.js';
import { registerIntakeRoutes } from './routes/intake-routes.js';
import { registerForm2PdfRoutes } from './routes/form2pdf-routes.js';
import { registerHealthRoutes } from './routes/health-routes.js';
import { registerPreviewRoutes } from './routes/preview-routes.js';
import { registerRuntimeRoutes } from './routes/runtime-routes.js';
import { registerScannerRoutes } from './routes/scanner-routes.js';
import { createScannerService } from './scanner-service.js';
import { getSandboxConfig, type SandboxConfig } from './sandbox-config.js';
import { buildFastifyLoggerOptions } from '@praxis-flow/server-shared';

export function buildSandboxApp(config: SandboxConfig = getSandboxConfig()): FastifyInstance {
  const app = Fastify({ logger: buildFastifyLoggerOptions() });
  const scanner = createScannerService(config);
  const previewStore = createPreviewStore();

  registerInternalAuth(app, config);
  registerHealthRoutes(app, scanner);
  registerScannerRoutes(app, config, scanner);
  registerRuntimeRoutes(app);
  registerForm2PdfRoutes(app, config, scanner);
  registerIntakeRoutes(app, config, scanner);
  registerPreviewRoutes(app, config, scanner, previewStore);

  return app;
}
