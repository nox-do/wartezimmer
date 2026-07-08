import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';

export type BusinessDayTopicCount = {
  topicId: string;
  topicLabel: string;
  count: number;
};

export type BusinessDayOpenVisit = {
  visitId: string;
  laneCode: string;
  number: number;
  topicLabel: string;
  identityRef: string | null;
  status: 'waiting' | 'called' | 'in_room' | 'absent_wait_here' | 'absent_return_later';
};

export type BusinessDayVisitStats = {
  businessDay: string;
  totalVisits: number;
  maxWaitMs: number;
  byTopic: BusinessDayTopicCount[];
  openVisits: BusinessDayOpenVisit[];
};

/** @deprecated Use BusinessDayOpenVisit */
export type BusinessDayOpenTicket = BusinessDayOpenVisit;
/** @deprecated Use BusinessDayVisitStats */
export type BusinessDayTicketStats = BusinessDayVisitStats;

export type RoutingCapabilities = {
  routingMode: 'simple' | 'complex';
  features: {
    complexRouting: boolean;
    journeyDesigner: boolean;
    routingSimulator: boolean;
    complexRoutingLicensed: boolean;
  };
};

export type DayLifecycleState = {
  businessDay: string;
  lastResetBusinessDay: string;
  needsDayStartHint: boolean;
  checkinLocked: boolean;
  dayClosePhase: 'open' | 'started';
  lastDayStats: BusinessDayVisitStats | null;
};

export type CheckinLockState = {
  checkinLocked: boolean;
  dayClosePhase: 'open' | 'started';
  updatedAt: string;
};

export type BusinessDayResetResult = {
  dayClosePhase: 'open' | 'started';
  resetTicketCount: number;
  updatedAt: string;
  lastResetBusinessDay: string;
  sandboxRestartRequired: boolean;
  sandboxRestartInitiated: boolean;
};

export async function fetchDayLifecycle() {
  return cookieAuthFetch<DayLifecycleState>('/api/v1/ops/day-lifecycle');
}

export async function fetchRoutingCapabilities() {
  return cookieAuthFetch<RoutingCapabilities>('/api/v1/ops/settings/capabilities');
}

export async function setCheckinLock(locked: boolean) {
  return cookieAuthFetch<CheckinLockState>('/api/v1/ops/checkin-lock', {
    method: 'POST',
    body: JSON.stringify({ locked }),
  });
}

export async function resetBusinessDay() {
  return cookieAuthFetch<BusinessDayResetResult>('/api/v1/ops/day-lifecycle/reset', {
    method: 'POST',
    body: JSON.stringify({ confirmBusinessDayReset: true }),
  });
}
