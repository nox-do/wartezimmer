import type { FastifyInstance } from 'fastify';
import type { StaffSessionManager } from '../auth/staff-session-auth.js';
import type { CoreDatabase } from '../shared/db/database.js';
import { registerOpsDeviceAuthorizationRoutes } from './ops/ops-device-authorization-routes.js';
import { registerOpsDeviceRoutes } from './ops/ops-device-routes.js';
import { registerOpsDeviceStreamRoutes } from './ops/ops-device-stream-routes.js';
import { registerOpsDayLifecycleRoutes } from './ops/ops-day-lifecycle-routes.js';
import { registerOpsEmergencyRoutes } from './ops/ops-emergency-routes.js';
import { registerOpsStreamRoutes } from './ops/ops-stream-routes.js';
import { registerOpsHealthRoutes } from './ops/ops-health-routes.js';
import { registerOpsMessagingRoutes } from './ops/ops-messaging-routes.js';
import { registerOpsOutboxRoutes } from './ops/ops-outbox-routes.js';
import { registerOpsDeploymentRoutes } from './ops/ops-deployment-routes.js';
import { registerOpsSettingsRoutes } from './ops/ops-settings-routes.js';
import { registerOpsMaintenanceRoutes } from './ops/ops-maintenance-routes.js';

export function registerOpsRoutes(
  app: FastifyInstance,
  db: CoreDatabase,
  sessions: StaffSessionManager,
): void {
  registerOpsHealthRoutes(app, db);
  registerOpsDeviceRoutes(app);
  registerOpsDeviceAuthorizationRoutes(app, db);
  registerOpsDeviceStreamRoutes(app, db);
  registerOpsDeploymentRoutes(app, db);
  registerOpsSettingsRoutes(app, db);
  registerOpsMaintenanceRoutes(app, db);
  registerOpsMessagingRoutes(app, db);
  registerOpsOutboxRoutes(app, db);
  registerOpsDayLifecycleRoutes(app, db);
  registerOpsEmergencyRoutes(app, db);
  registerOpsStreamRoutes(app, db, sessions);
}
