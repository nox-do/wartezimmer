import type { TranslationKey } from '$lib/i18n/core/translation-keys';
import type { RoutingCapabilities } from '$lib/mfa/practice-ops-api';

export type MfaSettingsNavItem = {
  id: string;
  labelKey: TranslationKey;
  href: string;
  requiresJourneyDesigner?: boolean;
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
      {
        id: 'journeys',
        labelKey: 'mfa.settings.navJourneys',
        href: '/mfa/settings/topics-rooms/journeys',
        requiresJourneyDesigner: true,
      },
    ],
  },
];

export function isJourneyDesignerNavVisible(capabilities: RoutingCapabilities | null): boolean {
  return (
    capabilities?.features.journeyDesigner === true && capabilities?.routingMode === 'complex'
  );
}

export function buildMfaSettingsNav(
  capabilities: RoutingCapabilities | null,
): MfaSettingsNavGroup[] {
  return MFA_SETTINGS_NAV.map((group) => ({
    ...group,
    children: group.children.filter(
      (item) => !item.requiresJourneyDesigner || isJourneyDesignerNavVisible(capabilities),
    ),
  }));
}

export function isMfaSettingsItemActive(pathname: string, href: string): boolean {
  return pathname === href;
}
