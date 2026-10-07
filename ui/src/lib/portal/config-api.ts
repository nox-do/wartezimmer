import { publicFetch } from '$lib/api/public-fetch';
import type { PracticeProfile } from '$lib/practice/practice-profile-client';
import type { TerminalPatientLocale } from '@wartezimmer/domain';

export type PortalConfig = {
  terminalPatientLocales: TerminalPatientLocale[];
  portalEnabled: boolean;
  practiceProfile: PracticeProfile;
};

export function fetchPortalConfig() {
  return publicFetch<PortalConfig>('/api/v1/portal/config');
}
