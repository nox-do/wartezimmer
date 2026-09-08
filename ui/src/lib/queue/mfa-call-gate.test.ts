import { describe, expect, it } from 'vitest';
import {
  canMfaCallVisit,
  isMfaPickupActionPending,
  resolveMfaCallBlockedReason,
} from './mfa-call-gate';

describe('canMfaCallVisit', () => {
  it('allows call for waiting + call', () => {
    expect(
      canMfaCallVisit({
        status: 'waiting',
        movementMode: 'call',
        destinationRoomId: 'labor',
      }),
    ).toBe(true);
  });

  it('allows call when movementMode is missing (legacy/simple)', () => {
    expect(
      canMfaCallVisit({
        status: 'waiting',
        movementMode: null,
        destinationRoomId: 'labor',
      }),
    ).toBe(true);
  });

  it('requires DnD when the configured route only targets the waiting room', () => {
    expect(
      canMfaCallVisit({
        status: 'waiting',
        movementMode: 'call',
        destinationRoomId: 'pf_waiting',
      }),
    ).toBe(false);
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

describe('isMfaPickupActionPending', () => {
  it('distinguishes initial pickup, room transfer, and completed arrival', () => {
    expect(
      isMfaPickupActionPending({
        status: 'waiting',
        movementMode: 'pickup',
        escortTransferPending: false,
      }),
    ).toBe(true);
    expect(
      isMfaPickupActionPending({
        status: 'in_room',
        movementMode: 'pickup',
        escortTransferPending: true,
      }),
    ).toBe(true);
    expect(
      isMfaPickupActionPending({
        status: 'in_room',
        movementMode: 'pickup',
        escortTransferPending: false,
      }),
    ).toBe(false);
  });
});

describe('resolveMfaCallBlockedReason', () => {
  it('returns null when callable', () => {
    expect(
      resolveMfaCallBlockedReason({
        status: 'waiting',
        movementMode: 'call',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        roomLabel: null,
      }),
    ).toBeNull();
  });

  it('explains that a concrete room must be selected', () => {
    expect(
      resolveMfaCallBlockedReason({
        status: 'waiting',
        movementMode: 'call',
        destinationRoomId: 'pf_waiting',
        destinationRoomLabel: 'Wartezimmer',
        roomLabel: null,
      }),
    ).toEqual({ kind: 'room_required' });
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
