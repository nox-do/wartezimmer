import type { TranslationKey } from '$lib/i18n/core/translation-keys';

export type MfaSettingsNavItem = {
  id: string;
  labelKey: TranslationKey;
  href: string;
};

export type MfaSettingsNavGroup = {
  id: string;
  labelKey: TranslationKey;
  href: string;
  children: MfaSettingsNavItem[];
};

export const MFA_SETTINGS_NAV: MfaSettingsNavGroup[] = [
  {
    id: 'operations',
    labelKey: 'mfa.settings.betriebTitle',
    href: '/mfa/settings/operations',
    children: [],
  },
  {
    id: 'topics-rooms',
    labelKey: 'mfa.settings.themesRoomsTitle',
    href: '/mfa/settings/topics-rooms',
    children: [
      {
        id: 'topics',
        labelKey: 'mfa.settings.navTopics',
        href: '/mfa/settings/topics-rooms/topics',
      },
    ],
  },
];

export function isMfaSettingsItemActive(pathname: string, href: string): boolean {
  return pathname === href;
}
