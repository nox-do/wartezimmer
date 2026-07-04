import { describe, expect, it } from 'vitest';
import { shouldRedirectFromTerminalAuthRoute } from './terminal-auth-route-guard';
import type { TerminalOpsSnapshot } from './terminal-ops-context';

function ops(overrides: Partial<TerminalOpsSnapshot>): TerminalOpsSnapshot {
  return {
    loading: false,
    deviceAuthorized: true,
    checkinLocked: false,
    emergencyEnabled: false,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: true,
    terminalAuthNameDobEnabled: true,
    terminalAuthEgkEnabled: true,
    terminalPatientLocales: ['de-DE'],
    emergencyActive: false,
    ...overrides,
  };
}

describe('shouldRedirectFromTerminalAuthRoute', () => {
  it('waits for heartbeat while loading', () => {
    expect(
      shouldRedirectFromTerminalAuthRoute(
        ops({ loading: true, terminalAuthPhoneEnabled: false }),
        'phone_dob',
      ),
    ).toBe(false);
  });

  it('redirects when the auth method is disabled', () => {
    expect(
      shouldRedirectFromTerminalAuthRoute(ops({ terminalAuthPhoneEnabled: false }), 'phone_dob'),
    ).toBe(true);
    expect(
      shouldRedirectFromTerminalAuthRoute(ops({ terminalAuthNameDobEnabled: false }), 'name_dob'),
    ).toBe(true);
    expect(shouldRedirectFromTerminalAuthRoute(ops({ terminalAuthEgkEnabled: false }), 'egk')).toBe(
      true,
    );
  });

  it('allows enabled auth routes', () => {
    expect(shouldRedirectFromTerminalAuthRoute(ops({}), 'name_dob')).toBe(false);
  });
});
