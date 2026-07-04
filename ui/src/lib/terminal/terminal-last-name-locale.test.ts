import { describe, expect, it } from 'vitest';
import {
  appendLastNameChar,
  formatLastNameDisplay,
  getLastNameFieldError,
  isAllowedLastNameChar,
  isLastNameInputValid,
  normalizeLastNameForSubmit,
  TERMINAL_LAST_NAME_MAX_LENGTH,
} from './terminal-last-name-locale';

describe('terminal last name locale', () => {
  it('allows Turkish letters and normalizes with tr-TR casing rules', () => {
    expect(isAllowedLastNameChar('ş', 'tr-TR')).toBe(true);
    expect(isAllowedLastNameChar('ı', 'tr-TR')).toBe(true);
    expect(normalizeLastNameForSubmit('yılmaz', 'tr-TR')).toBe('Yılmaz');
    expect(normalizeLastNameForSubmit('İSTANBUL', 'tr-TR')).toBe('İstanbul');
  });

  it('keeps dotted and dotless I distinct for Turkish', () => {
    expect(appendLastNameChar('', 'I', 'tr-TR')).toBe('ı');
    expect(appendLastNameChar('', 'İ', 'tr-TR')).toBe('i');
  });

  it('restricts English names to basic Latin', () => {
    expect(isAllowedLastNameChar('ü', 'en-GB')).toBe(false);
    expect(isAllowedLastNameChar('z', 'en-GB')).toBe(true);
  });

  it('prepares Cyrillic input for ru-RU', () => {
    expect(isAllowedLastNameChar('И', 'ru-RU')).toBe(true);
    expect(isAllowedLastNameChar('z', 'ru-RU')).toBe(false);
  });

  it('still allows German umlauts for de-DE', () => {
    expect(isAllowedLastNameChar('ü', 'de-DE')).toBe(true);
    expect(isAllowedLastNameChar('ş', 'de-DE')).toBe(false);
  });

  it('normalizes submitted last names with leading capital', () => {
    expect(normalizeLastNameForSubmit('müller', 'de-DE')).toBe('Müller');
    expect(normalizeLastNameForSubmit('von braun', 'de-DE')).toBe('Von braun');
    expect(isLastNameInputValid('müller')).toBe(true);
    expect(isLastNameInputValid('von braun')).toBe(true);
  });

  it('allows spaces and hyphens in last names', () => {
    expect(isLastNameInputValid('müller-schmidt')).toBe(true);
    expect(isLastNameInputValid('de la cruz')).toBe(true);
  });

  it('appends spaces and hyphens without altering them', () => {
    expect(appendLastNameChar('von', ' ', 'de-DE')).toBe('von ');
    expect(appendLastNameChar('müller', '-', 'de-DE')).toBe('müller-');
  });

  it('rejects empty and oversized last names', () => {
    expect(getLastNameFieldError('   ')).toBe('terminal.nameRequired');
    expect(getLastNameFieldError('a'.repeat(TERMINAL_LAST_NAME_MAX_LENGTH + 1))).toBe(
      'terminal.nameTooLong',
    );
  });

  it('formats display with locale-aware casing', () => {
    expect(formatLastNameDisplay('müller', 'de-DE')).toBe('Müller');
  });
});
