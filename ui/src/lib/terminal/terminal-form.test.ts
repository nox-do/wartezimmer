import { describe, expect, it } from 'vitest';
import {
  getDobFieldError,
  getPhoneFieldError,
  isDobInputValid,
  isPhoneInputValid,
} from './terminal-form';

describe('getPhoneFieldError', () => {
  it('accepts 9–11 digit mobile suffix without leading zero', () => {
    expect(getPhoneFieldError('172111111')).toBeNull();
    expect(getPhoneFieldError('1512345678')).toBeNull();
    expect(getPhoneFieldError('15123456789')).toBeNull();
  });

  it('rejects leading zero and too few digits', () => {
    expect(getPhoneFieldError('01512345678')).toBe('terminal.phoneNoLeadingZero');
    expect(getPhoneFieldError('1512')).toBe('terminal.phoneTooShort');
  });
});

describe('getDobFieldError', () => {
  it('accepts a valid past date', () => {
    expect(getDobFieldError('15061990')).toBeNull();
    expect(isDobInputValid('15061990')).toBe(true);
  });

  it('rejects incomplete, invalid calendar day, and future dates', () => {
    expect(getDobFieldError('1506')).toBe('terminal.dobIncomplete');
    expect(getDobFieldError('31131990')).toBe('terminal.dobInvalid');
    expect(getDobFieldError('01012099')).toBe('terminal.dobFuture');
  });
});

describe('isPhoneInputValid', () => {
  it('requires at least 9 digits after +49', () => {
    expect(isPhoneInputValid('+49', '172111111')).toBe(true);
    expect(isPhoneInputValid('+49', '1512345678')).toBe(true);
    expect(isPhoneInputValid('+49', '1512')).toBe(false);
  });
});
