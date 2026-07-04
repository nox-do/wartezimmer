import { describe, expect, it } from 'vitest';
import {
  arrayMoveToInsertBefore,
  isTopicSortNoOpMove,
  readTopicIdFromSortDragId,
  readTopicIdFromSortTargetId,
  readTopicSortDropPayload,
  topicSortDragId,
  topicSortInsertBeforeIndex,
  topicSortLineOffsetPx,
  topicSortTargetId,
} from './topic-sort-drop.js';

describe('topic sort drop', () => {
  it('round-trips ids', () => {
    expect(topicSortDragId('blut')).toBe('topic-sort:blut');
    expect(topicSortTargetId('blut')).toBe('topic-sort-target:blut');
    expect(readTopicIdFromSortDragId('topic-sort:blut')).toBe('blut');
  });

  it('validates payload', () => {
    expect(readTopicSortDropPayload({ kind: 'topic-sort', topicId: 'blut', index: 2 })).toEqual({
      kind: 'topic-sort',
      topicId: 'blut',
      index: 2,
    });
    expect(readTopicSortDropPayload({ kind: 'room' })).toBeNull();
  });

  it('handles insert helpers', () => {
    expect(readTopicIdFromSortTargetId('topic-sort-target:blut')).toBe('blut');
    expect(topicSortInsertBeforeIndex(2, 90, 80, 40)).toBe(2);
    expect(topicSortInsertBeforeIndex(2, 110, 80, 40)).toBe(3);
    expect(isTopicSortNoOpMove(1, 1)).toBe(true);
    expect(isTopicSortNoOpMove(1, 2)).toBe(true);
    expect(isTopicSortNoOpMove(1, 3)).toBe(false);
    expect(arrayMoveToInsertBefore(['A', 'B', 'C', 'D'], 1, 3)).toEqual(['A', 'C', 'B', 'D']);
    expect(arrayMoveToInsertBefore(['A', 'B', 'C', 'D'], 3, 1)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('centers the line offset on insertion slots', () => {
    const rows = [
      { top: 100, bottom: 140 },
      { top: 148, bottom: 188 },
      { top: 196, bottom: 236 },
    ];

    expect(topicSortLineOffsetPx(100, rows, 0)).toBe(0);
    expect(topicSortLineOffsetPx(100, rows, 1)).toBe(44);
    expect(topicSortLineOffsetPx(100, rows, 2)).toBe(92);
    expect(topicSortLineOffsetPx(100, rows, 3)).toBe(136);
  });
});
