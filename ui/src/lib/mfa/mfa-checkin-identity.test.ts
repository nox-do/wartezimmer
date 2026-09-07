import { describe, expect, it } from 'vitest';
import { manualMfaIdentityRef } from './mfa-checkin-identity';

describe('manualMfaIdentityRef', () => {
  it('accepts names including non-ASCII letters', () => {
    expect(manualMfaIdentityRef('  Özdemir  ')).toBe('Özdemir');
  });

  it('does not treat phone numbers or punctuation as manual names', () => {
    expect(manualMfaIdentityRef('0172 1234567')).toBeUndefined();
    expect(manualMfaIdentityRef('---')).toBeUndefined();
  });
});
