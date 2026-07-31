import type { TranslationKey } from '$lib/i18n/core/translation-keys';
import type { StaffSettingsNavGroup } from '$lib/staff/settings-nav';

export type HomeLauncherLink = {
  id: string;
  labelKey: TranslationKey;
  href: string;
  leadKey?: TranslationKey;
};

/** Content cards for Schnellzugriffe — open in a new tab. */
export const HOME_QUICK_LINKS: HomeLauncherLink[] = [
  {
    id: 'mfa',
    labelKey: 'nav.mfa',
    href: '/mfa',
    leadKey: 'home.quickMfaLead',
  },
  {
    id: 'terminal',
    labelKey: 'nav.terminal',
    href: '/terminal',
    leadKey: 'home.quickTerminalLead',
  },
  {
    id: 'tv',
    labelKey: 'nav.tv',
    href: '/tv',
    leadKey: 'home.quickTvLead',
  },
  {
    id: 'portal',
    labelKey: 'nav.portal',
    href: '/portal',
    leadKey: 'home.quickPortalLead',
  },
  {
    id: 'ops',
    labelKey: 'nav.ops',
    href: '/ops',
    leadKey: 'home.quickOpsLead',
  },
];

/** Two sidebar entries: content lives on the page. */
export const HOME_NAV: StaffSettingsNavGroup[] = [
  {
    id: 'quick',
    labelKey: 'home.navQuick',
    href: '/',
    children: [],
  },
  {
    id: 'panels',
    labelKey: 'home.navRooms',
    href: '/panels',
    children: [],
  },
];
