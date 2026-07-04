import type { Catalog, Visit } from './types.js';

/** Raum-Panel / scoped Surface: Transition nur wenn Visit-Zielort passt. */
export function assertActingLocationScope(visit: Visit, actingLocationId: string | undefined): void {
  if (!actingLocationId) return;
  if (visit.targetLocationId !== actingLocationId) {
    throw new Error('VISIT_LOCATION_MISMATCH');
  }
}

export function assertCallTargetLocation(catalog: Catalog, targetLocationId: string | null | undefined): void {
  if (!targetLocationId) return;
  const location = catalog.locations.find((item) => item.id === targetLocationId);
  if (!location?.active) throw new Error('LOCATION_INACTIVE_OR_MISSING');
}
