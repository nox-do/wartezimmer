import { mfaAuthFetch } from '$lib/api/staff-auth-fetch';
import type {
  BusinessDayResetResponse,
  DayLifecycleResponse,
  OpsStateResponse,
  RoutingCapabilitiesResponse,
} from '$lib/ops/openapi-types';

export type {
  BusinessDayResetResponse as BusinessDayResetResult,
  DayLifecycleResponse as DayLifecycleState,
  OpsStateResponse as CheckinLockState,
  RoutingCapabilitiesResponse as RoutingCapabilities,
} from '$lib/ops/openapi-types';

export type BusinessDayVisitStats = NonNullable<DayLifecycleResponse['lastDayStats']>;
export type BusinessDayTopicCount = BusinessDayVisitStats['byTopic'][number];
export type BusinessDayOpenVisit = BusinessDayVisitStats['openVisits'][number];

export async function fetchDayLifecycle() {
  return mfaAuthFetch<DayLifecycleResponse>('/api/v1/ops/day-lifecycle');
}

export async function fetchRoutingCapabilities() {
  return mfaAuthFetch<RoutingCapabilitiesResponse>('/api/v1/ops/settings/capabilities');
}

export async function setCheckinLock(locked: boolean) {
  return mfaAuthFetch<OpsStateResponse>('/api/v1/ops/checkin-lock', {
    method: 'POST',
    body: JSON.stringify({ locked }),
  });
}

export async function resetBusinessDay() {
  return mfaAuthFetch<BusinessDayResetResponse>('/api/v1/ops/day-lifecycle/reset', {
    method: 'POST',
    body: JSON.stringify({ confirmBusinessDayReset: true }),
  });
}
