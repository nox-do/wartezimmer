import { describe, expect, it } from 'vitest';
import { getAppSurface } from './app-surface';

describe('getAppSurface', () => {
  it('keeps the scaffold surface separate from room panel routes', () => {
    expect(getAppSurface('/')).toBeNull();
    expect(getAppSurface('/room-panel')).toBe('room-panel');
  });
});
