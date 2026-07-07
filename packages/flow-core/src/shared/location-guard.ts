import type { Catalog, Visit } from './types.js';
import { isOpenVisitStatus } from './visit-flow.js';

export type LocationTopicDefaultRoom = {
  topicId: string;
  defaultRoomId: string;
};

export type LocationReferenceKind =
  | 'topic_default_room'
  | 'journey_step'
  | 'routing_rule'
  | 'queue_home'
  | 'visit_last_known'
  | 'visit_target';

export type LocationReference = {
  kind: LocationReferenceKind;
  id: string;
};

type LocationGuardVisit = Pick<Visit, 'id' | 'status' | 'lastKnownLocationId' | 'targetLocationId'>;

function openLocationGuardVisits(visits: LocationGuardVisit[] = []): LocationGuardVisit[] {
  return visits.filter((visit) => isOpenVisitStatus(visit.status));
}

export function locationReferences(
  catalog: Pick<Catalog, 'journeySteps' | 'routingRules' | 'queues'>,
  locationId: string,
  options: {
    visits?: LocationGuardVisit[];
    topicDefaultRooms?: LocationTopicDefaultRoom[];
  } = {},
): LocationReference[] {
  const references: LocationReference[] = [];

  for (const topic of options.topicDefaultRooms ?? []) {
    if (topic.defaultRoomId === locationId) {
      references.push({ kind: 'topic_default_room', id: topic.topicId });
    }
  }

  for (const step of catalog.journeySteps) {
    if (step.targetLocationId === locationId) {
      references.push({ kind: 'journey_step', id: step.id });
    }
  }

  for (const rule of catalog.routingRules) {
    if (
      rule.initialLastKnownLocationId === locationId ||
      rule.initialTargetLocationId === locationId
    ) {
      references.push({ kind: 'routing_rule', id: rule.id });
    }
  }

  for (const queue of catalog.queues) {
    if (queue.homeLocationId === locationId) {
      references.push({ kind: 'queue_home', id: queue.id });
    }
  }

  for (const visit of openLocationGuardVisits(options.visits)) {
    if (visit.lastKnownLocationId === locationId) {
      references.push({ kind: 'visit_last_known', id: visit.id });
    }
    if (visit.targetLocationId === locationId) {
      references.push({ kind: 'visit_target', id: visit.id });
    }
  }

  return references;
}

export function assertLocationRemovable(params: {
  catalog: Pick<Catalog, 'journeySteps' | 'routingRules' | 'queues'>;
  locationId: string;
  visits?: LocationGuardVisit[];
  topicDefaultRooms?: LocationTopicDefaultRoom[];
}): void {
  if (
    locationReferences(params.catalog, params.locationId, {
      visits: params.visits,
      topicDefaultRooms: params.topicDefaultRooms,
    }).length > 0
  ) {
    throw new Error('LOCATION_IN_USE');
  }
}
