import { describe, expect, test } from 'vitest';
import {
  computeDeviceQuicksettingsPhase,
  isDevicePresenceStreamConnected,
} from './ops-stream-device-phase';

const baseInput = {
  pairingPending: false,
  awaitingConnection: false,
  presenceStatus: 'offline' as const,
  streamConnected: false,
  wasOnline: false,
  wasPaired: false,
};

describe('isDevicePresenceStreamConnected', () => {
  test('requires online status and an open device stream', () => {
    expect(isDevicePresenceStreamConnected('online', true)).toBe(true);
    expect(isDevicePresenceStreamConnected('online', false)).toBe(false);
    expect(isDevicePresenceStreamConnected('stale', true)).toBe(false);
  });
});

describe('computeDeviceQuicksettingsPhase', () => {
  test('returns unpaired for a fresh device', () => {
    expect(computeDeviceQuicksettingsPhase(baseInput)).toBe('unpaired');
  });

  test('returns pairing while code is pending', () => {
    expect(
      computeDeviceQuicksettingsPhase({
        ...baseInput,
        pairingPending: true,
        presenceStatus: 'online',
      }),
    ).toBe('pairing');
  });

  test('returns connecting while waiting for device stream', () => {
    expect(
      computeDeviceQuicksettingsPhase({
        ...baseInput,
        awaitingConnection: true,
        wasPaired: true,
      }),
    ).toBe('connecting');
  });

  test('prefers connecting over a lagging pairing snapshot', () => {
    expect(
      computeDeviceQuicksettingsPhase({
        ...baseInput,
        pairingPending: true,
        awaitingConnection: true,
        wasPaired: true,
      }),
    ).toBe('connecting');
  });

  test('returns online only when the device stream is connected', () => {
    expect(
      computeDeviceQuicksettingsPhase({
        ...baseInput,
        presenceStatus: 'online',
        streamConnected: true,
        wasOnline: true,
        wasPaired: true,
      }),
    ).toBe('online');
  });

  test('does not treat heartbeat-only online as online phase', () => {
    expect(
      computeDeviceQuicksettingsPhase({
        ...baseInput,
        presenceStatus: 'online',
        streamConnected: false,
      }),
    ).toBe('unpaired');
  });

  test('keeps pairing visible when a stale stream snapshot is still cached', () => {
    expect(
      computeDeviceQuicksettingsPhase({
        ...baseInput,
        pairingPending: true,
        presenceStatus: 'online',
        streamConnected: true,
      }),
    ).toBe('pairing');
  });

  test('prefers online over a lagging pairing snapshot when stream is connected', () => {
    expect(
      computeDeviceQuicksettingsPhase({
        ...baseInput,
        pairingPending: true,
        presenceStatus: 'online',
        streamConnected: true,
        wasOnline: true,
        wasPaired: true,
      }),
    ).toBe('online');
  });

  test('returns disconnected after a previously paired device goes offline', () => {
    expect(
      computeDeviceQuicksettingsPhase({
        ...baseInput,
        wasOnline: true,
        wasPaired: true,
      }),
    ).toBe('disconnected');
  });
});
