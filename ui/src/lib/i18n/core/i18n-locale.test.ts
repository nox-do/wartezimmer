import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, getBrowserLocale, normalizeLocale } from './I18nConfig';
import { isAppLocale } from './I18nTypes';
import { TERMINAL_PATIENT_LOCALES } from '@praxis-flow/domain';

describe('i18n locale helpers', () => {
  it('isAppLocale accepts all patient locales', () => {
    for (const locale of TERMINAL_PATIENT_LOCALES) {
      expect(isAppLocale(locale)).toBe(true);
    }
    expect(isAppLocale('fr-FR')).toBe(false);
  });

  it('normalizeLocale falls back to de-DE for unknown codes', () => {
    expect(normalizeLocale('uk-UA')).toBe('uk-UA');
    expect(normalizeLocale('fr-FR')).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it('getBrowserLocale maps uk before ru', () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { language: 'uk-UA' },
    });
    expect(getBrowserLocale()).toBe('uk-UA');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original });
  });
});
