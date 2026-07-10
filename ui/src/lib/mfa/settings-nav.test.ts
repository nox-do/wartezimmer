import { describe, expect, it } from 'vitest';
import {
  buildMfaSettingsNav,
  isJourneyDesignerNavVisible,
  isMfaSettingsItemActive,
  MFA_SETTINGS_NAV,
} from './settings-nav';

describe('MFA settings nav', () => {
  it('defines groups and the topics child route', () => {
    expect(MFA_SETTINGS_NAV.map((group) => group.id)).toEqual(['operations', 'topics-rooms']);
    expect(MFA_SETTINGS_NAV[0].children).toEqual([]);
    expect(MFA_SETTINGS_NAV[1].children.map((item) => item.id)).toEqual(['topics', 'journeys']);
  });

  it('hides journeys in simple mode', () => {
    const nav = buildMfaSettingsNav({
      routingMode: 'simple',
      openVisitCount: 0,
      features: {
        complexRouting: false,
        journeyDesigner: false,
        routingSimulator: false,
        complexRoutingLicensed: false,
      },
    });

    expect(nav[1].children.map((item) => item.id)).toEqual(['topics']);
  });

  it('shows journeys only when journey designer is enabled in complex mode', () => {
    expect(
      isJourneyDesignerNavVisible({
        routingMode: 'complex',
        openVisitCount: 0,
        features: {
          complexRouting: true,
          journeyDesigner: true,
          routingSimulator: false,
          complexRoutingLicensed: true,
        },
      }),
    ).toBe(true);

    expect(
      isJourneyDesignerNavVisible({
        routingMode: 'complex',
        openVisitCount: 0,
        features: {
          complexRouting: true,
          journeyDesigner: false,
          routingSimulator: false,
          complexRoutingLicensed: true,
        },
      }),
    ).toBe(false);

    const nav = buildMfaSettingsNav({
      routingMode: 'complex',
      openVisitCount: 0,
      features: {
        complexRouting: true,
        journeyDesigner: true,
        routingSimulator: false,
        complexRoutingLicensed: true,
      },
    });
    expect(nav[1].children.map((item) => item.id)).toEqual(['topics', 'journeys']);
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
