import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/api/staff-auth-fetch', () => ({
  mfaAuthFetch: vi.fn(),
}));

import { generateRoomId } from './ops-settings-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateRoomId', () => {
  it('generates an internal ID with the expected format', () => {
    const roomId = generateRoomId(new Set());

    expect(roomId).toMatch(/^r[a-z0-9]{6}$/);
  });

  it('keeps the format and collision check after repeated random collisions', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const roomId = generateRoomId(new Set(['raaaaaa', 'r000000']));

    expect(roomId).toBe('r000001');
    expect(roomId).toMatch(/^r[a-z0-9]{6}$/);
    expect(getRandomValues).toHaveBeenCalledTimes(32);
  });
});
