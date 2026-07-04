import { explainVisibility } from '@praxis-flow/flow-core';
import type { Runtime } from '@praxis-flow/flow-core/server';
import type { VisitView } from '@praxis-flow/flow-core';
import { getBusinessDay } from '../db/database-time.js';
import { PF_FLOW_SURFACE_TV } from './sync-catalog-from-ops-settings.js';

export type FlowCoreVisitSummary = {
  visitId: string;
  queueNumber: string;
  terminalInstruction: string;
  status: string;
  primaryTopicId: string | null;
  checkInPath: string;
  targetLocationId: string | null;
  lastKnownLocationId: string | null;
  movementMode: string;
  publicDisplayMode: string;
};

export type FlowCoreTvSnapshotVisit = {
  visitId: string;
  queueNumber: string;
  status: string;
  primaryTopicId: string | null;
  lastKnownLocationId: string | null;
  targetLocationId: string | null;
  publicDisplayMode: string;
  visible: boolean;
  visibilityReason: string;
  matchingRuleIds: string[];
  ruleId: string | null;
};

export type FlowCoreTvSnapshot = {
  surfaceId: string;
  surfaceName: string | null;
  businessDay: string;
  visibleCount: number;
  totalVisitCount: number;
  visits: FlowCoreTvSnapshotVisit[];
};

export function mapFlowCoreVisitSummary(visit: VisitView): FlowCoreVisitSummary {
  return {
    visitId: visit.id,
    queueNumber: visit.queueNumber,
    terminalInstruction: visit.terminalInstruction,
    status: visit.status,
    primaryTopicId: visit.primaryTopicId ?? null,
    checkInPath: visit.checkInPath,
    targetLocationId: visit.targetLocationId ?? null,
    lastKnownLocationId: visit.lastKnownLocationId ?? null,
    movementMode: visit.movementMode,
    publicDisplayMode: visit.publicDisplayMode,
  };
}

export function buildFlowCoreTvSnapshot(runtime: Runtime): FlowCoreTvSnapshot {
  const catalog = runtime.catalog();
  const surface = catalog.surfaces.find((item) => item.id === PF_FLOW_SURFACE_TV);
  const rules = catalog.surfaceDisplayRules.filter((rule) => rule.surfaceId === PF_FLOW_SURFACE_TV);
  const visits = runtime.visits().map((visit) => {
    const explanation = explainVisibility(visit, surface, rules);
    return {
      visitId: visit.id,
      queueNumber: visit.queueNumber,
      status: visit.status,
      primaryTopicId: visit.primaryTopicId ?? null,
      lastKnownLocationId: visit.lastKnownLocationId ?? null,
      targetLocationId: visit.targetLocationId ?? null,
      publicDisplayMode: visit.publicDisplayMode,
      visible: explanation.visible,
      visibilityReason: explanation.reason,
      matchingRuleIds: explanation.matchingRuleIds,
      ruleId: explanation.rule?.id ?? null,
    };
  });

  return {
    surfaceId: PF_FLOW_SURFACE_TV,
    surfaceName: surface?.name ?? null,
    businessDay: getBusinessDay(),
    visibleCount: visits.filter((entry) => entry.visible).length,
    totalVisitCount: visits.length,
    visits,
  };
}

export function findTvVisit(snapshot: FlowCoreTvSnapshot, visitId: string): FlowCoreTvSnapshotVisit | undefined {
  return snapshot.visits.find((entry) => entry.visitId === visitId);
}
