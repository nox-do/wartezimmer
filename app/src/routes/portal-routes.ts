import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { registerPatientDocumentRoutes } from './patient-documents-routes.js';
import { registerPortalConfigRoutes } from './portal-config-routes.js';
import { registerSessionRoutes } from './sessions-routes.js';

/** Registers the complete portal API as one deliberately bounded module. */
export function registerPortalRoutes(app: FastifyInstance, db: CoreDatabase): void {
  registerPortalConfigRoutes(app, db);
  registerSessionRoutes(app, db);
  registerPatientDocumentRoutes(app, db);
}
