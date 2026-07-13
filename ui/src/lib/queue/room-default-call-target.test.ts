import { describe, expect, it } from 'vitest';
import type { PracticeRoom } from '$lib/ops/openapi-types';
import { defaultCallRoom } from './room-default-call-target';

const rooms: PracticeRoom[] = [
  { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
  { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: false },
];

describe('defaultCallRoom', () => {
  it('returns the marked enabled room', () => {
    expect(defaultCallRoom(rooms)?.roomId).toBe('empfang');
  });
});
