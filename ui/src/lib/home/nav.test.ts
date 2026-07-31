import { describe, expect, it } from 'vitest';
import { HOME_NAV, HOME_QUICK_LINKS } from './nav';
import { isStaffSettingsHrefActive } from '$lib/staff/settings-nav';

describe('home nav', () => {
  it('has two sidebar entries', () => {
    expect(HOME_NAV.map((item) => item.id)).toEqual(['quick', 'panels']);
    expect(HOME_NAV.map((item) => item.href)).toEqual(['/', '/panels']);
  });

  it('lists quick-link cards for the content area', () => {
    expect(HOME_QUICK_LINKS.map((item) => item.id)).toEqual([
      'mfa',
      'terminal',
      'tv',
      'portal',
      'ops',
    ]);
  });

  it('treats root href as exact match only', () => {
    expect(isStaffSettingsHrefActive('/', '/')).toBe(true);
    expect(isStaffSettingsHrefActive('/panels', '/')).toBe(false);
    expect(isStaffSettingsHrefActive('/panels', '/panels')).toBe(true);
  });
});
