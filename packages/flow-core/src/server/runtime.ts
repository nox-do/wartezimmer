import type { DatabaseSync } from 'node:sqlite';
import {
  resolveBusinessDay as defaultResolveBusinessDay,
  type ResolveBusinessDay,
} from '@praxis-flow/flow-core';
import { createCatalogRepository } from './catalog-repository.js';
import { createVisitRepository } from './visit-repository.js';
import { createVisitService } from './visit-service.js';
import { createAdminService } from './admin-service.js';
import { createFailureInjector } from './test-hooks.js';

export { openDb, dbPath } from './open-db.js';

export function createRuntime(
  db: DatabaseSync,
  options: {
    testHooks?: { failAfter?: string };
    resolveBusinessDay?: ResolveBusinessDay;
  } = {},
) {
  const maybeFail = createFailureInjector(options.testHooks?.failAfter);
  const resolveBusinessDay = options.resolveBusinessDay ?? defaultResolveBusinessDay;

  const catalogRepository = createCatalogRepository(db);
  const visitRepository = createVisitRepository(db, catalogRepository);
  const visitService = createVisitService({
    db,
    catalogRepository,
    visitRepository,
    maybeFail,
    resolveBusinessDay,
  });
  const adminService = createAdminService({ db, catalogRepository, maybeFail });

  return {
    catalog: catalogRepository.loadCatalog,
    visits: visitRepository.visits,
    events: visitRepository.events,
    checkIn: visitService.checkIn,
    supersede: visitService.supersede,
    transition: visitService.transition,
    redirect: visitService.redirect,
    cancel: visitService.cancel,
    reassignTarget: visitService.reassignTarget,
    /** @deprecated Host: Katalog via Ops-Settings-Sync. Nur Package-Tests / Legacy. */
    saveRule: adminService.saveRule,
    /** @deprecated Host: Katalog via Ops-Settings-Sync. Nur Package-Tests / Legacy. */
    saveJourneyTemplate: adminService.saveJourneyTemplate,
    /** @deprecated Host: Katalog via Ops-Settings-Sync. Nur Package-Tests / Legacy. */
    saveTopic: adminService.saveTopic,
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
