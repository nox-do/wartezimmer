import { mfaAuthFetch } from '$lib/api/staff-auth-fetch';

export type DeviceAuthorizationListItem = {
  authorizationId: string;
  role: 'tv' | 'terminal' | 'room-panel';
  deviceId: string | null;
  roomId: string | null;
  placement: 'outside' | 'inside' | null;
  createdAt: string;
  lastSeenAt: string | null;
};

export async function fetchDeviceAuthorizations() {
  return mfaAuthFetch<{ authorizations: DeviceAuthorizationListItem[] }>(
    '/api/v1/ops/device-authorizations',
  );
}

export async function revokeDeviceAuthorization(authorizationId: string) {
  return mfaAuthFetch<{ ok: true }>(
    `/api/v1/ops/device-authorizations/${encodeURIComponent(authorizationId)}/revoke`,
    { method: 'POST' },
  );
}
