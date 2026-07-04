import { describe, expect, it } from 'vitest';
import { compactPhoneForApi, formatStoredPhoneForDisplay } from './format-phone-display';

describe('formatStoredPhoneForDisplay', () => {
  it('adds space after +49 for compact check-in numbers', () => {
    expect(formatStoredPhoneForDisplay('+49172111111')).toBe('+49 172111111');
  });

  it('normalizes national 0-prefix numbers', () => {
    expect(formatStoredPhoneForDisplay('0172111111')).toBe('+49 172111111');
  });

  it('is idempotent when already formatted', () => {
    expect(formatStoredPhoneForDisplay('+49 172111111')).toBe('+49 172111111');
  });
});

describe('compactPhoneForApi', () => {
  it('removes spaces for API payload', () => {
    expect(compactPhoneForApi('+49 172111111')).toBe('+49172111111');
  });
});
