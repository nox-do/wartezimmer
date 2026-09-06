import { describe, expect, it } from 'vitest';
import { OPS_SETTINGS_FOOTER, OPS_SETTINGS_NAV } from './settings-nav';

describe('Ops settings nav', () => {
  it('uses short sidebar labels in order', () => {
    expect(OPS_SETTINGS_NAV.map((item) => item.id)).toEqual([
      'practice',
      'routing',
      'storage',
      'contacts',
      'messaging',
      'portal',
      'security',
      'maintenance',
    ]);
    expect(OPS_SETTINGS_NAV.every((item) => item.children.length === 0)).toBe(true);
  });

  it('links to MFA settings in the footer', () => {
    expect(OPS_SETTINGS_FOOTER.href).toBe('/mfa/settings');
    expect(OPS_SETTINGS_FOOTER.external).toBe(true);
  });
});
