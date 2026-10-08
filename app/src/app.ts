import { startRecallDeliveryPolling } from './shared/messaging/recall-delivery-poller.js';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { getCoreDatabase } from './shared/db/database.js';
import { registerCheckinRoutes } from './routes/checkin-routes.js';
import { registerOpsRoutes } from './routes/ops-routes.js';
import { registerQueueRoutes } from './routes/queue-routes.js';
import { registerQueueStreamRoutes } from './routes/queue-stream-routes.js';
import { registerClientAuth } from './auth/client-auth.js';
import { createStaffSessionManager, getStaffSessionAuthConfig } from './auth/session-grants.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerPortalRoutes } from './routes/portal-routes.js';
import { registerDocumentRoutes } from './routes/documents-routes.js';
import { OutboxWorker, readOutboxWorkerOptionsFromEnv } from './shared/outbox/outbox-worker.js';
import { registerIdentityRoutes } from './routes/identity-routes.js';
import { registerSandboxEmbedProxyRoutes } from './routes/sandbox-embed-proxy-routes.js';
import { registerPracticeRoutes } from './routes/practice-routes.js';
import { registerDefaultErrorHandler } from './http/default-error-handler.js';
import { registerOpenApiDocs } from './openapi/register-openapi-docs.js';
import { PATIENT_UPLOAD_MAX_BYTES } from './shared/documents/patient-upload-limits.js';
import { resyncRecallWindowExpiryScheduler } from './shared/queue/recall-window-expiry-scheduler.js';
import { buildFastifyLoggerOptions } from '@wartezimmer/server-shared/logger';
import { toStaffPinHashConfig } from './shared/db/database-auth-settings.js';
import { registerSecurityHeaders } from './http/security-headers.js';
import { trustProxyHeaders } from './http/trusted-proxy.js';

export function resolveAppTrustProxy(): false | 1 {
  return trustProxyHeaders() ? 1 : false;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    ...buildFastifyLoggerOptions(),
    // Proxy headers are trusted only in the explicitly configured Caddy mode.
    // Exactly one hop then selects Caddy's right-most X-Forwarded-For entry.
    trustProxy: resolveAppTrustProxy(),
  });

  await app.register(multipart, {
    limits: { fileSize: PATIENT_UPLOAD_MAX_BYTES, files: 1 },
  });
  registerSecurityHeaders(app);

  const db = getCoreDatabase();
  const outboxWorker = new OutboxWorker(db, readOutboxWorkerOptionsFromEnv());
  const staffAuthConfig = getStaffSessionAuthConfig(toStaffPinHashConfig(db.getAuthSettings()));
  const staffSessions = createStaffSessionManager({
    sessionTtlMs: staffAuthConfig.sessionTtlMs,
    sessionIdleTtlMs: staffAuthConfig.sessionIdleTtlMs,
  });

  registerDefaultErrorHandler(app);

  await registerOpenApiDocs(app);
  registerClientAuth(app, { staffSessions, deviceGrants: db });
  registerAuthRoutes(app, staffSessions, db);
  registerOpsRoutes(app, db, staffSessions);
  registerPracticeRoutes(app, db);
  registerCheckinRoutes(app, db);
  registerQueueRoutes(app, db);
  registerQueueStreamRoutes(app, db, staffSessions);
  registerPortalRoutes(app, db);
  registerIdentityRoutes(app, db);
  registerDocumentRoutes(app, db);
  registerSandboxEmbedProxyRoutes(app);

  let stopRecallDeliveryPolling: (() => Promise<void>) | undefined;
  app.addHook('onReady', async () => {
    resyncRecallWindowExpiryScheduler(db);
    outboxWorker.start();
    stopRecallDeliveryPolling = startRecallDeliveryPolling(db);
  });
  app.addHook('onClose', async () => {
    outboxWorker.stop();
    await stopRecallDeliveryPolling?.();
  });

  return app;
}
