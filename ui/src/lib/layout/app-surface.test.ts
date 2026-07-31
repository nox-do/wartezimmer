import { describe, expect, it } from 'vitest';
import { getAppSurface } from './app-surface';

describe('getAppSurface', () => {
  it('maps sidebar settings surfaces explicitly', () => {
    expect(getAppSurface('/')).toBe('settings');
    expect(getAppSurface('/panels')).toBe('settings');
    expect(getAppSurface('/ops/practice')).toBe('settings');
    expect(getAppSurface('/mfa/settings')).toBe('settings');
    expect(getAppSurface('/mfa/settings/operations')).toBe('settings');
  });

  it('keeps ops setup on default chrome (no sidebar layout)', () => {
    expect(getAppSurface('/ops/setup')).toBeNull();
  });

  it('keeps MFA dashboard separate from settings', () => {
    expect(getAppSurface('/mfa')).toBe('mfa');
    expect(getAppSurface('/mfa/login')).toBe('mfa');
  });

  it('keeps the scaffold surface separate from room panel routes', () => {
    expect(getAppSurface('/room-panel')).toBe('room-panel');
  });
});
