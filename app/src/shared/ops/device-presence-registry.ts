import { publishOpsEvent } from './ops-event-hub.js';
import {
  clearPendingPairingForRole,
  currentPairingEpoch,
  hasPendingPairingForRole,
} from './device-pairing-registry.js';
import { TERMINAL_DEVICE_ID, WAITING_ROOM_DEVICE_ID } from './device-ids.js';
import { pairedRoleForDeviceKind } from './device-role.js';
import { PRESENCE_OFFLINE_AFTER_MS, PRESENCE_STALE_AFTER_MS } from './stream-constants.js';

export { TERMINAL_DEVICE_ID, WAITING_ROOM_DEVICE_ID };

export type DevicePresenceStatus = 'online' | 'stale' | 'offline';
export type DeviceKind = 'tv' | 'terminal' | 'room-panel' | 'unknown';
const KNOWN_DEVICE_IDS = [WAITING_ROOM_DEVICE_ID, TERMINAL_DEVICE_ID] as const;

type DeviceState = {
  deviceId: string;
  kind: DeviceKind;
  lastSeenAt: string | null;
  lastClientTime: string | null;
  lastRevision: number | null;
  activeStreamConnections: number;
  streamPairingEpoch: number | null;
};

export type DevicePresenceSummary = {
  deviceId: string;
  kind: DeviceKind;
  status: DevicePresenceStatus;
  streamConnected: boolean;
  lastSeenAt: string | null;
  lastClientTime: string | null;
  lastRevision: number | null;
};

const devices = new Map<string, DeviceState>();
const lastPublishedFingerprint = new Map<string, string>();
const lastPublishedStatus = new Map<string, DevicePresenceStatus>();
const presenceTransitionTimers = new Map<
  string,
  { stale?: ReturnType<typeof setTimeout>; offline?: ReturnType<typeof setTimeout> }
>();

function inferDeviceKind(deviceId: string): DeviceKind {
  if (deviceId === WAITING_ROOM_DEVICE_ID) {
    return 'tv';
  }
  if (deviceId === TERMINAL_DEVICE_ID) {
    return 'terminal';
  }
  return 'unknown';
}

function getOrCreate(deviceId: string): DeviceState {
  const existing = devices.get(deviceId);
  if (existing) {
    return existing;
  }

  const created: DeviceState = {
    deviceId,
    kind: inferDeviceKind(deviceId),
    lastSeenAt: null,
    lastClientTime: null,
    lastRevision: null,
    activeStreamConnections: 0,
    streamPairingEpoch: null,
  };
  devices.set(deviceId, created);
  return created;
}

function pairedDeviceExpectsStream(state: DeviceState): boolean {
  if (state.kind === 'room-panel') {
    return true;
  }

  if (state.kind !== 'tv' && state.kind !== 'terminal') {
    return false;
  }

  return !hasPendingPairingForRole(pairedRoleForDeviceKind(state.kind));
}

function computeStatus(state: DeviceState, nowMs: number): DevicePresenceStatus {
  if (state.kind === 'room-panel') {
    return state.activeStreamConnections > 0 ? 'online' : 'offline';
  }

  if (pairedDeviceExpectsStream(state) && state.activeStreamConnections > 0) {
    return 'online';
  }

  const presenceAgeMs = state.lastSeenAt
    ? nowMs - Date.parse(state.lastSeenAt)
    : Number.POSITIVE_INFINITY;
  if (presenceAgeMs < PRESENCE_STALE_AFTER_MS) {
    return 'online';
  }
  if (presenceAgeMs < PRESENCE_OFFLINE_AFTER_MS) {
    return 'stale';
  }
  return 'offline';
}

export function getDevicePresenceSummary(
  deviceId: string,
  nowMs = Date.now(),
): DevicePresenceSummary {
  const state = getOrCreate(deviceId);
  return {
    deviceId: state.deviceId,
    kind: state.kind,
    status: computeStatus(state, nowMs),
    streamConnected: state.activeStreamConnections > 0,
    lastSeenAt: state.lastSeenAt,
    lastClientTime: state.lastClientTime,
    lastRevision: state.lastRevision,
  };
}

export function isDeviceReachable(deviceId: string, nowMs = Date.now()): boolean {
  const summary = getDevicePresenceSummary(deviceId, nowMs);
  return summary.status === 'online' && summary.streamConnected;
}

export function listDevicePresence(nowMs = Date.now()): DevicePresenceSummary[] {
  const knownIds = new Set<string>(KNOWN_DEVICE_IDS);
  for (const deviceId of devices.keys()) {
    knownIds.add(deviceId);
  }

  return [...knownIds].map((deviceId) => getDevicePresenceSummary(deviceId, nowMs));
}

function presenceFingerprint(summary: DevicePresenceSummary): string {
  return `${summary.status}:${summary.streamConnected}:${summary.lastSeenAt ?? ''}`;
}

function clearPresenceTransitionTimers(deviceId: string): void {
  const timers = presenceTransitionTimers.get(deviceId);
  if (timers?.stale) {
    clearTimeout(timers.stale);
  }
  if (timers?.offline) {
    clearTimeout(timers.offline);
  }
  presenceTransitionTimers.delete(deviceId);
}

function clearPairingIfOffline(
  summary: DevicePresenceSummary,
  previousStatus: DevicePresenceStatus | null,
): void {
  if (summary.status !== 'offline' || previousStatus === 'offline') {
    return;
  }

  if (summary.kind === 'tv' || summary.kind === 'terminal') {
    clearPendingPairingForRole(pairedRoleForDeviceKind(summary.kind));
  }
}

function schedulePresenceTransitions(deviceId: string, state: DeviceState): void {
  clearPresenceTransitionTimers(deviceId);

  if (!state.lastSeenAt) {
    return;
  }

  const lastSeenMs = Date.parse(state.lastSeenAt);
  const nowMs = Date.now();
  const staleDelayMs = lastSeenMs + PRESENCE_STALE_AFTER_MS - nowMs;
  const offlineDelayMs = lastSeenMs + PRESENCE_OFFLINE_AFTER_MS - nowMs;
  const timers: { stale?: ReturnType<typeof setTimeout>; offline?: ReturnType<typeof setTimeout> } =
    {};

  if (staleDelayMs > 0) {
    timers.stale = setTimeout(() => {
      publishDevicePresence(deviceId);
    }, staleDelayMs);
  }

  if (offlineDelayMs > 0) {
    timers.offline = setTimeout(() => {
      publishDevicePresence(deviceId);
    }, offlineDelayMs);
  }

  if (timers.stale || timers.offline) {
    presenceTransitionTimers.set(deviceId, timers);
  }
}

function publishDevicePresence(deviceId: string, nowMs = Date.now()): void {
  const previousStatus = lastPublishedStatus.get(deviceId) ?? null;

  const summary = listDevicePresence(nowMs).find((entry) => entry.deviceId === deviceId);
  if (
    !summary ||
    (summary.kind !== 'tv' && summary.kind !== 'terminal' && summary.kind !== 'room-panel')
  ) {
    return;
  }

  const fingerprint = presenceFingerprint(summary);
  if (lastPublishedFingerprint.get(deviceId) === fingerprint) {
    return;
  }

  lastPublishedFingerprint.set(deviceId, fingerprint);
  lastPublishedStatus.set(deviceId, summary.status);
  clearPairingIfOffline(summary, previousStatus);
  publishOpsEvent('device.presence', {
    deviceId: summary.deviceId,
    kind: summary.kind,
    status: summary.status,
    streamConnected: summary.streamConnected,
    lastSeenAt: summary.lastSeenAt,
  });
}

export function refreshKnownDevicePresence(nowMs = Date.now()): void {
  for (const deviceId of KNOWN_DEVICE_IDS) {
    publishDevicePresence(deviceId, nowMs);
  }
}

export function recordDevicePresence(input: {
  deviceId: string;
  kind?: DeviceKind;
  clientTime?: string;
  lastRevision?: number;
}): void {
  const state = getOrCreate(input.deviceId);
  state.kind = input.kind ?? state.kind;
  state.lastSeenAt = new Date().toISOString();
  state.lastClientTime = input.clientTime ?? null;
  if (input.lastRevision != null) {
    state.lastRevision = input.lastRevision;
  }
  schedulePresenceTransitions(input.deviceId, state);
  publishDevicePresence(input.deviceId);
}

export function markDeviceStreamConnected(input: { deviceId: string; kind?: DeviceKind }): void {
  const state = getOrCreate(input.deviceId);
  state.kind = input.kind ?? state.kind;
  state.lastSeenAt = new Date().toISOString();
  state.activeStreamConnections += 1;
  if (state.kind === 'tv' || state.kind === 'terminal') {
    state.streamPairingEpoch = currentPairingEpoch(pairedRoleForDeviceKind(state.kind));
  }
  schedulePresenceTransitions(input.deviceId, state);
  publishDevicePresence(input.deviceId);
}

export function markDeviceStreamDisconnected(deviceId: string): void {
  const state = getOrCreate(deviceId);
  const hadActiveStream = state.activeStreamConnections > 0;
  state.activeStreamConnections = Math.max(0, state.activeStreamConnections - 1);

  if (hadActiveStream && state.activeStreamConnections === 0) {
    if (state.kind === 'tv' || state.kind === 'terminal') {
      const role = pairedRoleForDeviceKind(state.kind);
      if (
        hasPendingPairingForRole(role) &&
        state.streamPairingEpoch === currentPairingEpoch(role)
      ) {
        clearPendingPairingForRole(role);
      }
    }
    state.streamPairingEpoch = null;
  }

  schedulePresenceTransitions(deviceId, state);
  publishDevicePresence(deviceId);
}

export function resetDevicePresenceForTests(): void {
  for (const deviceId of presenceTransitionTimers.keys()) {
    clearPresenceTransitionTimers(deviceId);
  }
  devices.clear();
  lastPublishedFingerprint.clear();
  lastPublishedStatus.clear();
}
