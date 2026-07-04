import { describe, expect, it } from 'vitest';
import { randomId } from './random-id';

describe('randomId', () => {
  it('returns uuid-shaped strings', () => {
    expect(randomId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('falls back when crypto.randomUUID is unavailable', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });
    try {
      expect(() => randomId()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: original,
      });
    }
  });
});
