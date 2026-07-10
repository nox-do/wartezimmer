import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/i18n/i18nStore.svelte', () => ({
  tf: (key: string, vars: Record<string, string>) => `${key}:${JSON.stringify(vars)}`,
  t: (key: string) => key,
}));

import { roomGuardErrorMessage } from './room-removal-guard';

describe('roomGuardErrorMessage', () => {
  it('maps ROOM_BLOCKED_QUEUE with disable context', () => {
    expect(
      roomGuardErrorMessage(
        { code: 'ROOM_BLOCKED_QUEUE', message: 'fallback', details: { tickets: 'A-1' } },
        'disable',
      ),
    ).toBe('mfa.settings.roomDisableBlockedQueue:{"tickets":"A-1"}');
  });

  it('maps ROOM_BLOCKED_QUEUE with remove context by default', () => {
    expect(
      roomGuardErrorMessage({
        code: 'ROOM_BLOCKED_QUEUE',
        message: 'fallback',
        details: { tickets: 'A-1' },
      }),
    ).toBe('mfa.settings.roomRemoveBlockedQueue:{"tickets":"A-1"}');
  });

  it('maps capacity and topics codes', () => {
    expect(
      roomGuardErrorMessage({
        code: 'ROOM_BLOCKED_CAPACITY',
        message: 'fallback',
        details: { tickets: 'B-2' },
      }),
    ).toBe('mfa.settings.roomCapacityBlockedQueue:{"tickets":"B-2"}');
    expect(
      roomGuardErrorMessage({
        code: 'ROOM_BLOCKED_TOPICS',
        message: 'fallback',
        details: { topics: 'Blut' },
      }),
    ).toBe('mfa.settings.roomRemoveBlockedTopics:{"topics":"Blut"}');
  });
});
