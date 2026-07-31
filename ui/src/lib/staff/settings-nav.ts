import type { TranslationKey } from '$lib/i18n/core/translation-keys';

export type StaffSettingsNavItem = {
  id: string;
  href: string;
  /** Open in a new tab (cross-surface / device links). */
  external?: boolean;
  /** i18n key; ignored when `label` is set. */
  labelKey?: TranslationKey;
  /** Pre-resolved label (e.g. dynamic room names). */
  label?: string;
};

export type StaffSettingsNavGroup = {
  id: string;
  /**
   * Destination for the group link. Omit for a non-clickable section heading
   * (children still render when present).
   */
  href?: string;
  external?: boolean;
  labelKey?: TranslationKey;
  label?: string;
  children: StaffSettingsNavItem[];
};

export type StaffSettingsFooterLink = {
  href: string;
  labelKey: TranslationKey;
  ariaLabelKey?: TranslationKey;
  /** Open in a new tab (cross-surface links). */
  external?: boolean;
};

export function isStaffSettingsHrefActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isStaffSettingsItemActive(pathname: string, href: string): boolean {
  return pathname === href;
}
