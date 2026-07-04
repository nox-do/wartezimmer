import { patientBearerFetch } from '$lib/api/patient-bearer-fetch';
import { publicFetch } from '$lib/api/public-fetch';
import type { CaptiveAuthorizeResponse, SessionMeResponse, SessionResolveResponse } from './types';

export async function resolvePortalSession(ticketCode: string) {
  return publicFetch<SessionResolveResponse>('/api/v1/sessions/resolve-ticket', {
    method: 'POST',
    body: JSON.stringify({ ticketCode }),
  });
}

export async function authorizeCaptivePortalSession(
  sessionToken: string,
  input: { clientIp?: string; clientMac?: string; redirectUrl?: string },
) {
  return patientBearerFetch<CaptiveAuthorizeResponse>(
    '/api/v1/sessions/captive-authorize',
    sessionToken,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export async function fetchPortalSessionMe(sessionToken: string) {
  return patientBearerFetch<SessionMeResponse>('/api/v1/sessions/me', sessionToken);
}
