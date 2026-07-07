import type { Catalog, Visit } from './types.js';
import { isOpenVisitStatus } from './visit-flow.js';

export type QueueReferenceKind = 'journey_step' | 'routing_rule' | 'display_rule' | 'visit';

export type QueueReference = {
  kind: QueueReferenceKind;
  id: string;
};

type QueueGuardVisit = Pick<Visit, 'id' | 'status' | 'queueId'>;

function openQueueGuardVisits(visits: QueueGuardVisit[] = []): QueueGuardVisit[] {
  return visits.filter((visit) => isOpenVisitStatus(visit.status));
}

export function queueReferences(
  catalog: Pick<Catalog, 'journeySteps' | 'routingRules' | 'surfaceDisplayRules'>,
  queueId: string,
  visits: QueueGuardVisit[] = [],
): QueueReference[] {
  const references: QueueReference[] = [];

  for (const step of catalog.journeySteps) {
    if (step.queueId === queueId) {
      references.push({ kind: 'journey_step', id: step.id });
    }
  }

  for (const rule of catalog.routingRules) {
    if (rule.initialQueueId === queueId) {
      references.push({ kind: 'routing_rule', id: rule.id });
    }
  }

  for (const rule of catalog.surfaceDisplayRules) {
    if (rule.queueId === queueId) {
      references.push({ kind: 'display_rule', id: rule.id });
    }
  }

  for (const visit of openQueueGuardVisits(visits)) {
    if (visit.queueId === queueId) {
      references.push({ kind: 'visit', id: visit.id });
    }
  }

  return references;
}

export function assertQueueRemovable(params: {
  catalog: Pick<Catalog, 'journeySteps' | 'routingRules' | 'surfaceDisplayRules'>;
  queueId: string;
  visits?: QueueGuardVisit[];
}): void {
  if (queueReferences(params.catalog, params.queueId, params.visits ?? []).length > 0) {
    throw new Error('QUEUE_IN_USE');
  }
}
