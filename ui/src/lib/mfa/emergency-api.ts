import { mfaAuthFetch } from '$lib/api/cookie-auth-fetch';

export async function acknowledgeEmergency(emergencyId: string) {
  return mfaAuthFetch<{
    emergencyId: string;
    status: 'acknowledged';
    raisedAt: string;
    acknowledgedAt: string;
    uiDisplayed: true;
  }>('/api/v1/ops/emergency/ack', {
    method: 'POST',
    body: JSON.stringify({ emergencyId, uiDisplayed: true }),
  });
}
