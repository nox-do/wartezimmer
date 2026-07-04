import type { DevicePresenceStatus } from '$lib/ops/device-presence-api';

export type DeviceQuicksettingsPhase =
  | 'pairing'
  | 'connecting'
  | 'online'
  | 'disconnected'
  | 'unpaired';

export type DeviceQuicksettingsPhaseInput = {
  pairingPending: boolean;
  awaitingConnection: boolean;
  presenceStatus: DevicePresenceStatus;
  streamConnected: boolean;
  wasOnline: boolean;
  wasPaired: boolean;
};

export function isDevicePresenceStreamConnected(
  presenceStatus: DevicePresenceStatus,
  streamConnected: boolean,
): boolean {
  return presenceStatus === 'online' && streamConnected;
}

export function computeDeviceQuicksettingsPhase(
  input: DeviceQuicksettingsPhaseInput,
): DeviceQuicksettingsPhase {
  if (input.awaitingConnection) {
    return 'connecting';
  }

  const streamConnected = isDevicePresenceStreamConnected(
    input.presenceStatus,
    input.streamConnected,
  );

  // Confirmed pairing with a live stream wins over a lagging pairing snapshot.
  if (streamConnected && (input.wasPaired || input.wasOnline)) {
    return 'online';
  }

  if (input.pairingPending) {
    return 'pairing';
  }

  if (streamConnected) {
    return 'online';
  }

  if (input.wasOnline || input.wasPaired) {
    return 'disconnected';
  }

  return 'unpaired';
}
