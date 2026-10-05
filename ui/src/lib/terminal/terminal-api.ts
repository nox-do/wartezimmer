import { terminalAuthFetch } from '$lib/api/cookie-auth-fetch';
import { t } from '$lib/i18n/i18nStore.svelte';
import type { EmergencyRaiseResponse, OpsHeartbeatResponse } from '$lib/ops/openapi-types';
import type {
  TerminalAuthPath,
  TerminalTopic,
  TerminalTopicsResponse,
  TicketCreated,
} from '$lib/terminal/openapi-types';

export type { TerminalAuthPath } from '$lib/terminal/openapi-types';

export type CheckinCreated = TicketCreated;
export type TerminalTopicOption = TerminalTopic;
export type TerminalHeartbeat = OpsHeartbeatResponse;

export async function fetchTerminalHeartbeat() {
  return terminalAuthFetch<OpsHeartbeatResponse>('/api/v1/ops/heartbeat');
}

export async function fetchTerminalTopics() {
  return terminalAuthFetch<TerminalTopicsResponse>('/api/v1/checkins/topics');
}

export async function createCheckin(input: {
  topicId: string;
  authPath: TerminalAuthPath;
  phoneNumber?: string;
  lastName?: string;
  birthDate?: string;
  identityRef?: string;
  patientLocale?: string;
}) {
  const headers: Record<string, string> = {};
  if (input.patientLocale?.trim()) {
    headers['X-Patient-Locale'] = input.patientLocale.trim();
  }
  const payload = {
    topicId: input.topicId,
    authPath: input.authPath,
    phoneNumber: input.phoneNumber,
    lastName: input.lastName,
    birthDate: input.birthDate,
    identityRef: input.identityRef,
  };
  return terminalAuthFetch<CheckinCreated>('/api/v1/checkins', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

export async function createAssistanceCheckin(patientLocale?: string) {
  const headers: Record<string, string> = {};
  if (patientLocale?.trim()) {
    headers['X-Patient-Locale'] = patientLocale.trim();
  }
  return terminalAuthFetch<CheckinCreated>('/api/v1/checkins/assistance', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
}

export async function raiseTerminalEmergency() {
  return terminalAuthFetch<EmergencyRaiseResponse>('/api/v1/ops/emergency/raise', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function mapCheckinErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'REGISTRATION_LIMIT_REACHED':
      return t('terminal.registrationLimitReached');
    case 'CHECKIN_LOCKED':
      return t('terminal.checkinLocked');
    case 'CHECKIN_CLOSED':
      return t('terminal.checkinClosed');
    case 'TOPIC_DISABLED':
      return t('terminal.topicDisabled');
    case 'TOPIC_CLOSED':
      return t('terminal.topicClosed');
    case 'INVALID_ARGUMENT':
      return t('terminal.invalidArgument');
    case 'CHECKIN_AUTH_PATH_DISABLED':
      return t('terminal.authPathDisabled');
    case 'TERMINAL_LAST_NAME_INVALID':
    case 'TERMINAL_BIRTH_DATE_INVALID':
    case 'TERMINAL_PHONE_INVALID':
      return t('terminal.invalidArgument');
    default:
      return fallback;
  }
}
