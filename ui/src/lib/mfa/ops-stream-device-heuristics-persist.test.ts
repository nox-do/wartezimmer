import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  loadPersistedDeviceHeuristics,
  savePersistedDeviceHeuristics,
} from './ops-stream-device-heuristics-persist';

describe('ops-stream-device-heuristics-persist', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    });
  });

  test('round-trips heuristics through sessionStorage', () => {
    savePersistedDeviceHeuristics({
      wasOnline: { 'checkin-terminal': true },
      wasPaired: { 'waiting-room': true },
    });

    expect(loadPersistedDeviceHeuristics()).toEqual({
      wasOnline: { 'checkin-terminal': true },
      wasPaired: { 'waiting-room': true },
    });
  });
});
