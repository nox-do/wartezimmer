import { arrayMove } from './array-move.js';

export const TOPIC_SORT_DRAG_PREFIX = 'topic-sort:';
export const TOPIC_SORT_TARGET_PREFIX = 'topic-sort-target:';

export type TopicSortDropPayload = {
  kind: 'topic-sort';
  topicId: string;
  index: number;
};

export function topicSortDragId(topicId: string): string {
  return `${TOPIC_SORT_DRAG_PREFIX}${topicId}`;
}

export function topicSortTargetId(topicId: string): string {
  return `${TOPIC_SORT_TARGET_PREFIX}${topicId}`;
}

export function readTopicSortDropPayload(data: unknown): TopicSortDropPayload | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (
    record.kind !== 'topic-sort' ||
    typeof record.topicId !== 'string' ||
    typeof record.index !== 'number'
  ) {
    return null;
  }

  return {
    kind: 'topic-sort',
    topicId: record.topicId,
    index: record.index,
  };
}

export function readTopicIdFromSortDragId(id: string): string | null {
  if (!id.startsWith(TOPIC_SORT_DRAG_PREFIX)) {
    return null;
  }
  const topicId = id.slice(TOPIC_SORT_DRAG_PREFIX.length).trim();
  return topicId || null;
}

export function readTopicIdFromSortTargetId(id: string): string | null {
  if (!id.startsWith(TOPIC_SORT_TARGET_PREFIX)) {
    return null;
  }
  const topicId = id.slice(TOPIC_SORT_TARGET_PREFIX.length).trim();
  return topicId || null;
}

export function topicSortInsertBeforeIndex(
  targetIndex: number,
  pointerY: number | null,
  rowTop: number,
  rowHeight: number,
): number {
  if (pointerY == null || rowHeight <= 0) {
    return targetIndex;
  }

  const midpoint = rowTop + rowHeight / 2;
  return pointerY < midpoint ? targetIndex : targetIndex + 1;
}

export function isTopicSortNoOpMove(fromIndex: number, insertBeforeIndex: number): boolean {
  return insertBeforeIndex === fromIndex || insertBeforeIndex === fromIndex + 1;
}

export function arrayMoveToInsertBefore<T>(
  items: readonly T[],
  fromIndex: number,
  insertBeforeIndex: number,
): T[] {
  if (isTopicSortNoOpMove(fromIndex, insertBeforeIndex)) {
    return [...items];
  }

  let toIndex = insertBeforeIndex;
  if (fromIndex < insertBeforeIndex) {
    toIndex -= 1;
  }

  return arrayMove(items, fromIndex, toIndex);
}

export type TopicSortRowRect = {
  top: number;
  bottom: number;
};

/** Y offset (px) for a 2px line inside the list, centered on the insertion slot. */
export function topicSortLineOffsetPx(
  listTop: number,
  rowRects: readonly TopicSortRowRect[],
  insertBefore: number,
): number | null {
  if (insertBefore < 0 || insertBefore > rowRects.length || rowRects.length === 0) {
    return null;
  }

  if (insertBefore === 0) {
    return rowRects[0]!.top - listTop;
  }

  if (insertBefore === rowRects.length) {
    return rowRects[rowRects.length - 1]!.bottom - listTop;
  }

  const above = rowRects[insertBefore - 1]!;
  const below = rowRects[insertBefore]!;
  return (above.bottom + below.top) / 2 - listTop;
}

export function measureTopicSortLineOffsetPx(
  listEl: HTMLElement,
  insertBefore: number,
  rowCount: number,
): number | null {
  if (insertBefore < 0 || insertBefore > rowCount || rowCount === 0) {
    return null;
  }

  const listTop = listEl.getBoundingClientRect().top;
  const rowRects: TopicSortRowRect[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const row = listEl.querySelector(`[data-topic-sort-index="${index}"]`);
    if (!(row instanceof HTMLElement)) {
      return null;
    }
    const rect = row.getBoundingClientRect();
    rowRects.push({ top: rect.top, bottom: rect.bottom });
  }

  return topicSortLineOffsetPx(listTop, rowRects, insertBefore);
}
