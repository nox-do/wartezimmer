import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';

export type BusinessDayTopicCount = {
  topicId: string;
  topicLabel: string;
  count: number;
};

export type BusinessDayOpenTicket = {
  visitId: string;
  laneCode: string;
  number: number;
  topicLabel: string;
  identityRef: string | null;
  status: 'waiting' | 'called' | 'in_room' | 'absent_wait_here' | 'absent_return_later';
};

export type BusinessDayTicketStats = {
  businessDay: string;
  totalTickets: number;
  maxWaitMs: number;
  byTopic: BusinessDayTopicCount[];
  openTickets: BusinessDayOpenTicket[];
};

export type DayLifecycleState = {
  businessDay: string;
  lastResetBusinessDay: string;
  needsDayStartHint: boolean;
  checkinLocked: boolean;
  dayClosePhase: 'open' | 'started';
  lastDayStats: BusinessDayTicketStats | null;
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
