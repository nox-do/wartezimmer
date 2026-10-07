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
import { buildFastifyLoggerOptions } from '@wartezimmer/server-shared/logger';

export function buildSandboxApp(config: SandboxConfig = getSandboxConfig()): FastifyInstance {
  const app = Fastify({ ...buildFastifyLoggerOptions() });
  const scanner = createScannerService(config);
  const previewStore = createPreviewStore();

  let updateTimer: ReturnType<typeof setInterval> | undefined;
  let lastUpdateOutcome: boolean | undefined;
  let lastUpdateLogAt = 0;
  const update = async (source: 'startup' | 'scheduled') => {
    let ok = true;
    try {
      await scanner.updateSignatures(source);
    } catch {
      ok = false;
    }
    if (lastUpdateOutcome !== ok || Date.now() - lastUpdateLogAt >= 24 * 3_600_000) {
      app.log[ok ? 'info' : 'warn'](
        { source },
        ok ? 'Scanner signatures confirmed current' : 'Scanner update failed; retrying on schedule',
      );
      lastUpdateLogAt = Date.now();
      lastUpdateOutcome = ok;
    }
  };
  app.addHook('onReady', async () => {
    if (!config.scanEnabled) return;
    if (process.env.CLAMAV_AUTO_UPDATE_ON_START !== 'false') void update('startup');
    updateTimer = setInterval(() => {
      void update('scheduled');
    }, 2 * 3_600_000);
    updateTimer.unref();
  });
  app.addHook('onClose', async () => {
    if (updateTimer) clearInterval(updateTimer);
  });

  registerInternalAuth(app, config);
  registerHealthRoutes(app, scanner);
  registerScannerRoutes(app, config, scanner);
  registerRuntimeRoutes(app);
  registerForm2PdfRoutes(app, config, scanner);
  registerIntakeRoutes(app, config, scanner, previewStore);
  registerPreviewRoutes(app, config, scanner, previewStore);

  return app;
}
