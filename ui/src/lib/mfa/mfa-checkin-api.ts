import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';
import type { TerminalTopic, VisitCreated } from '$lib/terminal/openapi-types';

export type MfaLookupCandidate = {
  identityRef: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  phoneNumberMasked: string | null;
  phoneNumberExact?: string | null;
};

export async function fetchMfaCheckinTopics() {
  return cookieAuthFetch<{ topics: TerminalTopic[] }>('/api/v1/checkins/topics');
}

export async function lookupMfaIdentityCandidates(input: {
  name?: string;
  birthDate?: string;
  phoneNumber?: string;
  limit?: number;
}) {
  return cookieAuthFetch<{ candidates: MfaLookupCandidate[] }>('/api/v1/identity/mfa-lookup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createMfaCheckin(input: {
  topicId: string;
  identityRef?: string;
}) {
  return cookieAuthFetch<VisitCreated>('/api/v1/checkins', {
    method: 'POST',
    body: JSON.stringify({
      topicId: input.topicId,
      authPath: 'mfa_assist',
      identityRef: input.identityRef,
    }),
  });
}
