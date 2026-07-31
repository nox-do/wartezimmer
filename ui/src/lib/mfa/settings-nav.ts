import type { RoutingCapabilities } from '$lib/mfa/practice-ops-api';
import type { StaffSettingsNavGroup, StaffSettingsNavItem } from '$lib/staff/settings-nav';
import { isStaffSettingsItemActive } from '$lib/staff/settings-nav';

export type MfaSettingsHref =
  | '/mfa/settings/operations'
  | '/mfa/settings/topics-rooms'
  | '/mfa/settings/topics-rooms/topics'
  | '/mfa/settings/topics-rooms/journeys';

export type MfaSettingsNavItem = StaffSettingsNavItem & {
  href: MfaSettingsHref;
  requiresJourneyDesigner?: boolean;
};

export type MfaSettingsNavGroup = Omit<StaffSettingsNavGroup, 'href' | 'children'> & {
  href: MfaSettingsHref;
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
  return capabilities?.features.journeyDesigner === true && capabilities?.routingMode === 'complex';
}

export function buildMfaSettingsNav(
  capabilities: RoutingCapabilities | null,
): StaffSettingsNavGroup[] {
  return MFA_SETTINGS_NAV.map((group) => ({
    ...group,
    children: group.children.filter(
      (item) => !item.requiresJourneyDesigner || isJourneyDesignerNavVisible(capabilities),
    ),
  }));
}

export const isMfaSettingsItemActive = isStaffSettingsItemActive;
