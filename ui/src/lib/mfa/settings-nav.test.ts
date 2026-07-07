import { describe, expect, it } from 'vitest';
import { isMfaSettingsItemActive, MFA_SETTINGS_NAV } from './settings-nav';

describe('MFA settings nav', () => {
  it('defines groups and the topics child route', () => {
    expect(MFA_SETTINGS_NAV.map((group) => group.id)).toEqual(['operations', 'topics-rooms']);
    expect(MFA_SETTINGS_NAV[0].children).toEqual([]);
    expect(MFA_SETTINGS_NAV[1].children).toEqual([
      {
        id: 'topics',
        labelKey: 'mfa.settings.navTopics',
        href: '/mfa/settings/topics-rooms/topics',
      },
    ]);
  });

  it('marks the active child by exact route', () => {
    expect(
      isMfaSettingsItemActive('/mfa/settings/topics-rooms/topics', '/mfa/settings/topics-rooms/topics'),
    ).toBe(true);
    expect(isMfaSettingsItemActive('/mfa/settings/topics-rooms', '/mfa/settings/topics-rooms/topics')).toBe(
      false,
    );
  });
});
