import { httpFetch } from '$lib/api/http-fetch';
import type { TerminalPatientLocale } from '@wartezimmer/domain';

export type PatientLocalesSnapshot = {
  terminalPatientLocales: TerminalPatientLocale[];
  portalEnabled: boolean;
};

export async function fetchPatientLocales() {
  return httpFetch<PatientLocalesSnapshot>('/api/v1/ops/patient-locales');
}
