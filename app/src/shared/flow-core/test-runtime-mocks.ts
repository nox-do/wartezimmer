import type { Runtime } from '@wartezimmer/flow-core/server';

/** Minimal Flow-Core runtime stub for snapshot builders without a live instance. */
export function emptyFlowCoreRuntimeForMocks(): Runtime {
  return {
    catalog: () => ({ surfaces: [], surfaceDisplayRules: [] }),
    visits: () => [],
  } as unknown as Runtime;
}
