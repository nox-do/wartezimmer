import { describe, expect, it } from 'vitest';
import type { PracticeRoom } from '$lib/ops/openapi-types';
import {
  defaultCallRoom,
  ensureSingleDefaultCallTarget,
  resolveDefaultCallRoomId,
} from './room-default-call-target';

const rooms: PracticeRoom[] = [
  { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
  { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: false },
];

describe('room default call target adapter', () => {
  it('defaultCallRoom returns the marked enabled room', () => {
    expect(defaultCallRoom(rooms)?.roomId).toBe('empfang');
  });

  it('resolveDefaultCallRoomId delegates to shared domain rules', () => {
    expect(resolveDefaultCallRoomId(rooms)).toBe('empfang');
    const next = ensureSingleDefaultCallTarget(rooms, 'labor');
    expect(defaultCallRoom(next)?.roomId).toBe('labor');
  });
});
