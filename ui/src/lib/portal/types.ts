export type { PatientDocument, PatientDocumentListResponse } from '$lib/documents/shared-types';

export type SessionResolveResponse = {
  sessionId: string;
  sessionToken: string;
  expiresAt: string;
  ticketId: string;
};

export type SessionMeResponse = {
  sessionId: string;
  ticketId: string;
  status: 'active' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  authPath: string;
  checkinPhone: string | null;
};

export type CaptiveAuthorizeResponse = {
  ok: true;
  wlanAuthorized: boolean;
  redirectUrl: string;
};
