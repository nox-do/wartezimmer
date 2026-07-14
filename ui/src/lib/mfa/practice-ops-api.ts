import { mfaAuthFetch } from '$lib/api/staff-auth-fetch';

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

export type RoutingCapabilities = {
  routingMode: 'simple' | 'complex';
  openVisitCount: number;
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
  return mfaAuthFetch<DayLifecycleState>('/api/v1/ops/day-lifecycle');
}

export async function fetchRoutingCapabilities() {
  return mfaAuthFetch<RoutingCapabilities>('/api/v1/ops/settings/capabilities');
}

export async function setCheckinLock(locked: boolean) {
  return mfaAuthFetch<CheckinLockState>('/api/v1/ops/checkin-lock', {
    method: 'POST',
    body: JSON.stringify({ locked }),
  });
}

export async function resetBusinessDay() {
  return mfaAuthFetch<BusinessDayResetResult>('/api/v1/ops/day-lifecycle/reset', {
    method: 'POST',
    body: JSON.stringify({ confirmBusinessDayReset: true }),
  });
}
