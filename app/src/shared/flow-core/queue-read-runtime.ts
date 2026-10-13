import type { Runtime } from '@wartezimmer/flow-core/server';
import type { CoreDatabase } from '../db/database.js';

/** Read-only contract used by the TV and room-panel snapshots. */
export type QueueReadRuntime = Pick<Runtime, 'catalog' | 'visits'>;

export function resolveQueueReadRuntime(db: CoreDatabase): QueueReadRuntime {
  if (typeof db.getFlowCoreRuntimeInstance === 'function') {
    return db.getFlowCoreRuntimeInstance();
  }
  // Lightweight database adapters without a routing runtime produce an empty view.
  return {
    catalog: () => ({
      topics: [],
      locations: [],
      queues: [],
      surfaces: [],
      surfaceDisplayRules: [],
      routingRules: [],
      journeyTemplates: [],
      journeySteps: [],
    }),
    visits: () => [],
  };
}
