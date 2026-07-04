import { type DevicePresenceStatus } from '$lib/ops/device-presence-api';
import {
  computeDeviceQuicksettingsPhase,
  isDevicePresenceStreamConnected,
  type DeviceQuicksettingsPhase,
} from './ops-stream-device-phase';
import {
  loadPersistedDeviceHeuristics,
  savePersistedDeviceHeuristics,
} from './ops-stream-device-heuristics-persist';
import type {
  DevicePairingOpsSnapshot,
  DevicePresenceOpsSnapshot,
  EmergencyOpsSnapshot,
} from './ops-stream-types';

export type { DeviceQuicksettingsPhase } from './ops-stream-device-phase';

export const opsStream = $state({
  emergency: null as EmergencyOpsSnapshot | null,
  devicePresence: {} as Record<string, DevicePresenceOpsSnapshot>,
  devicePairing: {
    tv: null,
    terminal: null,
  } as Record<'tv' | 'terminal', DevicePairingOpsSnapshot | null>,
  deviceWasOnline: {} as Record<string, boolean>,
  deviceWasPaired: {} as Record<string, boolean>,
  deviceAwaitingConnection: {} as Record<string, boolean>,
});

type PresenceWaiter = {
  deviceId: string;
  settle: (value: boolean) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const presenceWaiters = new Set<PresenceWaiter>();
const connectionWaitCancelByDevice = new Map<string, () => void>();

function hydrateDeviceHeuristicsFromSession(): void {
  const stored = loadPersistedDeviceHeuristics();
  opsStream.deviceWasOnline = { ...stored.wasOnline };
  opsStream.deviceWasPaired = { ...stored.wasPaired };
}

function persistDeviceHeuristics(): void {
  savePersistedDeviceHeuristics({
    wasOnline: { ...opsStream.deviceWasOnline },
    wasPaired: { ...opsStream.deviceWasPaired },
  });
}

function settlePresenceWaiter(waiter: PresenceWaiter, value: boolean): void {
  presenceWaiters.delete(waiter);
  clearTimeout(waiter.timeoutId);
  waiter.settle(value);
}

function isPairingPendingForDevice(deviceId: string): boolean {
  for (const kind of ['tv', 'terminal'] as const) {
    const pairing = opsStream.devicePairing[kind];
    if (pairing?.phase === 'pending' && pairing.deviceId === deviceId) {
      return true;
    }
  }

  return false;
}

function notifyPresenceWaiters(snapshot: DevicePresenceOpsSnapshot): void {
  if (
    !isDevicePresenceStreamConnected(snapshot.status, snapshot.streamConnected) ||
    isPairingPendingForDevice(snapshot.deviceId)
  ) {
    return;
  }

  for (const waiter of [...presenceWaiters]) {
    if (waiter.deviceId === snapshot.deviceId) {
      settlePresenceWaiter(waiter, true);
    }
  }
}

function clearDeviceHeuristics(deviceId: string): void {
  delete opsStream.deviceWasOnline[deviceId];
  delete opsStream.deviceWasPaired[deviceId];
  opsStream.deviceAwaitingConnection[deviceId] = false;
  cancelDeviceConnectionWait(deviceId);
  persistDeviceHeuristics();
}

function markDeviceWasPaired(deviceId: string): void {
  opsStream.deviceWasPaired[deviceId] = true;
  persistDeviceHeuristics();
}

function markDeviceOnline(deviceId: string): void {
  opsStream.deviceWasOnline[deviceId] = true;
  opsStream.deviceAwaitingConnection[deviceId] = false;
  persistDeviceHeuristics();
}

function clearDeviceAwaitingConnection(deviceId: string): void {
  opsStream.deviceAwaitingConnection[deviceId] = false;
}

export function cancelDeviceConnectionWait(deviceId: string): void {
  connectionWaitCancelByDevice.get(deviceId)?.();
  connectionWaitCancelByDevice.delete(deviceId);
}

export function beginDeviceConnectionWait(deviceId: string, timeoutMs = 10_000): void {
  cancelDeviceConnectionWait(deviceId);
  markDeviceWasPaired(deviceId);
  opsStream.deviceAwaitingConnection[deviceId] = true;

  const wait = waitForDevicePresenceOnline(deviceId, timeoutMs);
  connectionWaitCancelByDevice.set(deviceId, () => {
    wait.cancel();
    clearDeviceAwaitingConnection(deviceId);
  });

  void wait.promise.then((online) => {
    connectionWaitCancelByDevice.delete(deviceId);
    clearDeviceAwaitingConnection(deviceId);
    if (online) {
      markDeviceOnline(deviceId);
    }
  });
}

export function applyEmergencyOpsSnapshot(snapshot: EmergencyOpsSnapshot): void {
  opsStream.emergency = snapshot;
}

export function applyDevicePresenceOpsSnapshot(snapshot: DevicePresenceOpsSnapshot): void {
  opsStream.devicePresence[snapshot.deviceId] = snapshot;
  if (
    isDevicePresenceStreamConnected(snapshot.status, snapshot.streamConnected) &&
    !isPairingPendingForDevice(snapshot.deviceId)
  ) {
    markDeviceOnline(snapshot.deviceId);
  }
  notifyPresenceWaiters(snapshot);
}

export function applyDevicePairingOpsSnapshot(snapshot: DevicePairingOpsSnapshot): void {
  opsStream.devicePairing[snapshot.kind] = snapshot;
  if (snapshot.phase === 'pending') {
    clearDeviceHeuristics(snapshot.deviceId);
  }
}

export function resetOpsStreamStore(): void {
  for (const waiter of [...presenceWaiters]) {
    settlePresenceWaiter(waiter, false);
  }
  for (const deviceId of connectionWaitCancelByDevice.keys()) {
    cancelDeviceConnectionWait(deviceId);
  }
  opsStream.emergency = null;
  opsStream.devicePresence = {};
  opsStream.devicePairing = { tv: null, terminal: null };
  opsStream.deviceWasOnline = {};
  opsStream.deviceWasPaired = {};
  opsStream.deviceAwaitingConnection = {};
  hydrateDeviceHeuristicsFromSession();
}

export function getDevicePresenceStatus(deviceId: string): DevicePresenceStatus {
  return opsStream.devicePresence[deviceId]?.status ?? 'offline';
}

export function isDeviceStreamConnected(deviceId: string): boolean {
  const snapshot = opsStream.devicePresence[deviceId];
  if (!snapshot) {
    return false;
  }

  return isDevicePresenceStreamConnected(snapshot.status, snapshot.streamConnected);
}

export function isPairingPromptPending(kind: 'tv' | 'terminal'): boolean {
  return opsStream.devicePairing[kind]?.phase === 'pending';
}

export function getDeviceQuicksettingsPhase(
  deviceId: string,
  kind: 'tv' | 'terminal',
): DeviceQuicksettingsPhase {
  const presence = opsStream.devicePresence[deviceId];

  return computeDeviceQuicksettingsPhase({
    pairingPending: isPairingPromptPending(kind),
    awaitingConnection: opsStream.deviceAwaitingConnection[deviceId] ?? false,
    presenceStatus: presence?.status ?? 'offline',
    streamConnected: presence?.streamConnected ?? false,
    wasOnline: opsStream.deviceWasOnline[deviceId] ?? false,
    wasPaired: opsStream.deviceWasPaired[deviceId] ?? false,
  });
}

export function waitForDevicePresenceOnline(
  deviceId: string,
  timeoutMs = 10_000,
): {
  promise: Promise<boolean>;
  cancel: () => void;
} {
  const current = opsStream.devicePresence[deviceId];
  if (
    current &&
    isDevicePresenceStreamConnected(current.status, current.streamConnected) &&
    !isPairingPendingForDevice(deviceId)
  ) {
    return { promise: Promise.resolve(true), cancel: () => {} };
  }

  let settled = false;
  let resolveOuter: (value: boolean) => void = () => {};

  const waiter: PresenceWaiter = {
    deviceId,
    settle: (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      presenceWaiters.delete(waiter);
      clearTimeout(waiter.timeoutId);
      resolveOuter(value);
    },
    timeoutId: setTimeout(() => {}, 0),
  };

  const promise = new Promise<boolean>((resolve) => {
    resolveOuter = resolve;
    clearTimeout(waiter.timeoutId);
    waiter.timeoutId = setTimeout(() => waiter.settle(false), timeoutMs);
    waiter.timeoutId.unref?.();
    presenceWaiters.add(waiter);
  });

  return {
    promise,
    cancel: () => waiter.settle(false),
  };
}

hydrateDeviceHeuristicsFromSession();
