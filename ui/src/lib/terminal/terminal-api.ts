import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';
import { t } from '$lib/i18n/i18nStore.svelte';
import type { TerminalTopic, TicketCreated } from '$lib/terminal/openapi-types';

export type TerminalAuthPath = 'phone_dob' | 'name_dob' | 'egk' | 'mfa_assist';

export type CheckinCreated = TicketCreated;
export type TerminalTopicOption = TerminalTopic;

import type { TerminalPatientLocale } from '@praxis-flow/domain';

export type TerminalHeartbeat = {
  checkinLocked: boolean;
  serverTime: string;
  emergencyEnabled: boolean;
  terminalWlanPromoEnabled: boolean;
  terminalAuthPhoneEnabled: boolean;
  terminalAuthNameDobEnabled: boolean;
  terminalAuthEgkEnabled: boolean;
  terminalPatientLocales: TerminalPatientLocale[];
  emergencyActive: boolean;
};

const terminalDeviceHeaders = { 'X-Client-Role': 'terminal' };

export async function fetchTerminalHeartbeat() {
  return cookieAuthFetch<TerminalHeartbeat>('/api/v1/ops/heartbeat', {
    headers: terminalDeviceHeaders,
  });
}

export async function fetchTerminalTopics() {
  return cookieAuthFetch<{ topics: TerminalTopicOption[] }>('/api/v1/checkins/topics', {
    headers: terminalDeviceHeaders,
  });
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
  const headers: Record<string, string> = { ...terminalDeviceHeaders };
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
  return cookieAuthFetch<CheckinCreated>('/api/v1/checkins', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

export async function createMfaAssistCheckin() {
  return cookieAuthFetch<CheckinCreated>('/api/v1/checkins/mfa-assist', {
    method: 'POST',
    headers: terminalDeviceHeaders,
    body: JSON.stringify({}),
  });
}

export async function raiseTerminalEmergency() {
  return cookieAuthFetch<{ emergencyId: string; raisedAt: string }>('/api/v1/ops/emergency/raise', {
    method: 'POST',
    headers: terminalDeviceHeaders,
    body: JSON.stringify({}),
  });
}

export function mapCheckinErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
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
