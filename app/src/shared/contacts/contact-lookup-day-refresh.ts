import type { FastifyBaseLogger } from 'fastify';
import type { CoreDatabase } from '../db/database.js';
import { invalidateContactLookupCache } from './contact-lookup-cache.js';
import { settingsFromOpsRow } from './contact-lookup-config.js';
import { rebuildContactLookupRuntimeCache } from './contact-lookup-runtime.js';

/** Rebuild CSV contact lookup cache after business-day reset (async, non-blocking). */
export function scheduleContactLookupCacheRefreshAfterBusinessDayReset(
  db: CoreDatabase,
  log: FastifyBaseLogger,
): void {
  const lookupSettings = settingsFromOpsRow(db.getOpsSettings());
  if (!lookupSettings) {
    invalidateContactLookupCache();
    return;
  }

  void rebuildContactLookupRuntimeCache(lookupSettings).catch((error) => {
    invalidateContactLookupCache();
    log.warn(
      {
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      },
      'Contact lookup cache refresh after day reset failed; cache cleared',
    );
  });
}
