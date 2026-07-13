import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';
import { publicFetch } from '$lib/api/public-fetch';
import type { Result } from '$lib/types/result';
import type {
  DevicePairingConfirmResponse,
  DevicePairingStartResponse,
  DevicePairingStatusResponse,
} from './openapi-types';

export type DevicePairingKind = 'tv' | 'terminal';

export type { DevicePairingConfirmResponse, DevicePairingStartResponse, DevicePairingStatusResponse };

function pairingPath(kind: DevicePairingKind, suffix: string): string {
  return `/api/v1/auth/${kind}/pairing/${suffix}`;
}

export async function startDevicePairing(
  kind: DevicePairingKind,
  displayId: string,
): Promise<Result<DevicePairingStartResponse>> {
  return publicFetch<DevicePairingStartResponse>(pairingPath(kind, 'start'), {
    method: 'POST',
    body: JSON.stringify({ displayId }),
  });
}

export async function fetchDevicePairingStatus(
  kind: DevicePairingKind,
  pairingId: string,
): Promise<Result<DevicePairingStatusResponse>> {
  return publicFetch<DevicePairingStatusResponse>(
    `/api/v1/auth/${kind}/pairing/${encodeURIComponent(pairingId)}`,
    {},
    { credentials: 'include' },
  );
}

export async function confirmDevicePairing(
  kind: DevicePairingKind,
  code: string,
): Promise<Result<DevicePairingConfirmResponse>> {
  return cookieAuthFetch<DevicePairingConfirmResponse>(pairingPath(kind, 'confirm'), {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
