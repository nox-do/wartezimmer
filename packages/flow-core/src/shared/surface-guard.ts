import type { Catalog, Visit } from './types.js';
import { isOpenVisitStatus } from './visit-flow.js';

export type SurfaceReferenceKind = 'display_rule' | 'routing_rule' | 'visit';

export type SurfaceReference = {
  kind: SurfaceReferenceKind;
  id: string;
};

type SurfaceGuardVisit = Pick<Visit, 'id' | 'status' | 'lastSurfaceId'>;

function openSurfaceGuardVisits(visits: SurfaceGuardVisit[] = []): SurfaceGuardVisit[] {
  return visits.filter((visit) => isOpenVisitStatus(visit.status));
}

export function surfaceReferences(
  catalog: Pick<Catalog, 'surfaceDisplayRules' | 'routingRules'>,
  surfaceId: string,
  visits: SurfaceGuardVisit[] = [],
): SurfaceReference[] {
  const references: SurfaceReference[] = [];

  for (const rule of catalog.surfaceDisplayRules) {
    if (rule.surfaceId === surfaceId) {
      references.push({ kind: 'display_rule', id: rule.id });
    }
  }

  for (const rule of catalog.routingRules) {
    if (rule.allowedSurfaceIds?.includes(surfaceId)) {
      references.push({ kind: 'routing_rule', id: rule.id });
    }
  }

  for (const visit of openSurfaceGuardVisits(visits)) {
    if (visit.lastSurfaceId === surfaceId) {
      references.push({ kind: 'visit', id: visit.id });
    }
  }

  return references;
}

export function assertSurfaceRemovable(params: {
  catalog: Pick<Catalog, 'surfaceDisplayRules' | 'routingRules'>;
  surfaceId: string;
  visits?: SurfaceGuardVisit[];
}): void {
  if (surfaceReferences(params.catalog, params.surfaceId, params.visits ?? []).length > 0) {
    throw new Error('SURFACE_IN_USE');
  }
}
