import { describe, expect, it } from 'vitest';
import type { Result } from './result';

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

describe('Result', () => {
  it('models success', () => {
    const result = ok({ items: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toEqual([]);
    }
  });
});
