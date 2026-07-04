import { describe, expect, it } from 'vitest';
import { arrayMove } from './array-move.js';

describe('arrayMove', () => {
  it('reorders items', () => {
    expect(arrayMove(['A', 'B', 'C', 'D'], 0, 2)).toEqual(['B', 'C', 'A', 'D']);
    expect(arrayMove(['A', 'B', 'C', 'D'], 3, 0)).toEqual(['D', 'A', 'B', 'C']);
  });

  it('returns copy when indices match or are invalid', () => {
    const items = ['A', 'B'];
    expect(arrayMove(items, 0, 0)).toEqual(['A', 'B']);
    expect(arrayMove(items, -1, 0)).toEqual(['A', 'B']);
    expect(arrayMove(items, 0, 1)).not.toBe(items);
  });
});
