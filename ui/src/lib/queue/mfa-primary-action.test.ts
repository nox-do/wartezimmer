import { describe, expect, it } from 'vitest';
import { resolveMfaInRoomPrimaryAction } from './mfa-primary-action';

describe('resolveMfaInRoomPrimaryAction', () => {
  it('returns null outside in_room', () => {
    expect(resolveMfaInRoomPrimaryAction({ status: 'called' })).toBeNull();
    expect(resolveMfaInRoomPrimaryAction({ status: 'waiting' })).toBeNull();
  });

  it('prefers continue when journey step is completed', () => {
    expect(
      resolveMfaInRoomPrimaryAction({
        status: 'in_room',
        startedAt: null,
        journeyStepCompletedAt: '2026-07-11T10:00:00.000Z',
      }),
    ).toBe('continue');
    expect(
      resolveMfaInRoomPrimaryAction({
        status: 'in_room',
        startedAt: '2026-07-11T10:01:00.000Z',
        journeyStepCompletedAt: '2026-07-11T10:00:00.000Z',
      }),
    ).toBe('continue');
  });

  it('offers start when arrived but treatment not started', () => {
    expect(
      resolveMfaInRoomPrimaryAction({
        status: 'in_room',
        startedAt: null,
        journeyStepCompletedAt: null,
      }),
    ).toBe('start');
  });

  it('offers checkout when treatment is in progress and no next hop pending', () => {
    expect(
      resolveMfaInRoomPrimaryAction({
        status: 'in_room',
        startedAt: '2026-07-11T10:01:00.000Z',
        journeyStepCompletedAt: null,
      }),
    ).toBe('checkout');
  });
});
