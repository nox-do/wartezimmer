import { describe, expect, it } from 'vitest';
import { canMfaCallVisit, resolveMfaCallBlockedReason } from './mfa-call-gate';

describe('canMfaCallVisit', () => {
  it('allows call for waiting + call', () => {
    expect(canMfaCallVisit({ status: 'waiting', movementMode: 'call' })).toBe(true);
  });

  it('allows call when movementMode is missing (legacy/simple)', () => {
    expect(canMfaCallVisit({ status: 'waiting', movementMode: null })).toBe(true);
  });

  it('blocks call for directed', () => {
    expect(canMfaCallVisit({ status: 'directed', movementMode: 'self_go' })).toBe(false);
  });

  it('blocks call for pickup waiting', () => {
    expect(canMfaCallVisit({ status: 'waiting', movementMode: 'pickup' })).toBe(false);
  });

  it('blocks call for called/in_room', () => {
    expect(canMfaCallVisit({ status: 'called', movementMode: 'call' })).toBe(false);
    expect(canMfaCallVisit({ status: 'in_room', movementMode: 'call' })).toBe(false);
  });
});

describe('resolveMfaCallBlockedReason', () => {
  it('returns null when callable', () => {
    expect(
      resolveMfaCallBlockedReason({
        status: 'waiting',
        movementMode: 'call',
        destinationRoomLabel: 'Labor',
        roomLabel: null,
      }),
    ).toBeNull();
  });

  it('explains directed with destination', () => {
    expect(
      resolveMfaCallBlockedReason({
        status: 'directed',
        movementMode: 'self_go',
        destinationRoomLabel: 'Labor',
        roomLabel: null,
      }),
    ).toEqual({ kind: 'directed', roomLabel: 'Labor' });
  });

  it('explains pickup with destination', () => {
    expect(
      resolveMfaCallBlockedReason({
        status: 'waiting',
        movementMode: 'pickup',
        destinationRoomLabel: null,
        roomLabel: 'Labor',
      }),
    ).toEqual({ kind: 'pickup', roomLabel: 'Labor' });
  });
});
