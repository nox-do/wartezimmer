import { describe, expect, it } from 'vitest';
import {
  getDobFieldError,
  getPhoneFieldError,
  isDobInputValid,
  isPhoneInputValid,
} from './terminal-form';

describe('getPhoneFieldError', () => {
  it('maps domain phone issues to terminal i18n keys', () => {
    expect(getPhoneFieldError('172111111')).toBeNull();
    expect(getPhoneFieldError('01512345678')).toBe('terminal.phoneNoLeadingZero');
    expect(getPhoneFieldError('1512')).toBe('terminal.phoneTooShort');
    expect(getPhoneFieldError('151234567890')).toBe('terminal.phoneTooLong');
    expect(getPhoneFieldError('1512a45678')).toBe('terminal.phoneInvalidChars');
  });
});

describe('getDobFieldError', () => {
  it('maps domain dob issues to terminal i18n keys', () => {
    expect(getDobFieldError('15061990')).toBeNull();
    expect(isDobInputValid('15061990')).toBe(true);
    expect(getDobFieldError('1506')).toBe('terminal.dobIncomplete');
    expect(getDobFieldError('31131990')).toBe('terminal.dobInvalid');
    expect(getDobFieldError('01012099')).toBe('terminal.dobFuture');
  });
});

describe('isPhoneInputValid', () => {
  it('delegates suffix validity to domain', () => {
    expect(isPhoneInputValid('+49', '172111111')).toBe(true);
    expect(isPhoneInputValid('+49', '1512')).toBe(false);
  });
});
