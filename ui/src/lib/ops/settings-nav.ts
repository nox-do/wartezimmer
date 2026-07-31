import type { StaffSettingsFooterLink, StaffSettingsNavGroup } from '$lib/staff/settings-nav';

/** Short sidebar labels — long titles stay on the page content. */
export const OPS_SETTINGS_NAV: StaffSettingsNavGroup[] = [
  {
    id: 'practice',
    labelKey: 'ops.nav.general',
    href: '/ops/practice',
    children: [],
  },
  {
    id: 'storage',
    labelKey: 'ops.nav.storage',
    href: '/ops/storage',
    children: [],
  },
  {
    id: 'contacts',
    labelKey: 'ops.nav.contacts',
    href: '/ops/contacts',
    children: [],
  },
  {
    id: 'messaging',
    labelKey: 'ops.nav.messaging',
    href: '/ops/messaging',
    children: [],
  },
  {
    id: 'portal',
    labelKey: 'ops.nav.portal',
    href: '/ops/portal',
    children: [],
  },
  {
    id: 'security',
    labelKey: 'ops.nav.security',
    href: '/ops/security',
    children: [],
  },
  {
    id: 'maintenance',
    labelKey: 'ops.nav.maintenance',
    href: '/ops/maintenance',
    children: [],
  },
];

export const OPS_SETTINGS_FOOTER: StaffSettingsFooterLink = {
  href: '/mfa/settings',
  labelKey: 'ops.nav.mfaLink',
  ariaLabelKey: 'ops.nav.mfaLinkAria',
  external: true,
};
