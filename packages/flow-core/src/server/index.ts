/** Server/runtime exports for host integration and PoC tests. */
export { createRuntime, type Runtime } from './runtime.js';
export { openDb, dbPath } from './open-db.js';
export { resolveCheckInRouting } from './escort.js';
export { resolveQueueOnArrival, queueForLocation } from './location-routing.js';
export { runInTransaction } from './unit-of-work.js';
export { allocateQueueSequence } from './queue-counter.js';
export {
  loadCatalog,
  createCatalogRepository,
  stepsForTemplate,
  type CatalogRepository,
} from './catalog-repository.js';
export { createVisitRepository, type VisitRepository } from './visit-repository.js';
export {
  createVisitService,
  type VisitService,
  type SupersedeRequest,
  type SupersedeResult,
} from './visit-service.js';
export { createAdminService, type AdminService } from './admin-service.js';
export { createFailureInjector } from './test-hooks.js';
export { ensureVisitSupersedeColumns } from './visit-supersede-schema.js';
export { ensureVisitEventAuditColumns } from './visit-event-audit-schema.js';
