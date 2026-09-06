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
import { registerSessionRoutes } from './routes/sessions-routes.js';
import { registerPatientDocumentRoutes } from './routes/patient-documents-routes.js';
import { registerDocumentRoutes } from './routes/documents-routes.js';
import { OutboxWorker, readOutboxWorkerOptionsFromEnv } from './shared/outbox/outbox-worker.js';
import { registerIdentityRoutes } from './routes/identity-routes.js';
import { registerSandboxEmbedProxyRoutes } from './routes/sandbox-embed-proxy-routes.js';
import { registerPracticeRoutes } from './routes/practice-routes.js';
import { registerDefaultErrorHandler } from './http/default-error-handler.js';
import { registerOpenApiDocs } from './openapi/register-openapi-docs.js';
import { PATIENT_UPLOAD_MAX_BYTES } from './shared/documents/patient-upload-limits.js';
import { resyncRecallWindowExpiryScheduler } from './shared/queue/recall-window-expiry-scheduler.js';
import { resyncTerminalAssistPendingExpiryScheduler } from './shared/checkin/terminal-assist-pending-expiry-scheduler.js';
import { buildFastifyLoggerOptions } from '@praxis-flow/server-shared/logger';
import { toStaffPinHashConfig } from './shared/db/database-auth-settings.js';
import { registerSecurityHeaders } from './http/security-headers.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    ...buildFastifyLoggerOptions(),
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
  registerSessionRoutes(app, db);
  registerPatientDocumentRoutes(app, db);
  registerIdentityRoutes(app, db);
  registerDocumentRoutes(app, db);
  registerSandboxEmbedProxyRoutes(app);

  app.addHook('onReady', async () => {
    resyncRecallWindowExpiryScheduler(db);
    resyncTerminalAssistPendingExpiryScheduler(db);
    outboxWorker.start();
  });
  app.addHook('onClose', async () => {
    outboxWorker.stop();
  });

  return app;
}
