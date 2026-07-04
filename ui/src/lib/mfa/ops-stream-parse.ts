import type {
  DevicePairingOpsSnapshot,
  DevicePresenceOpsSnapshot,
  EmergencyOpsSnapshot,
} from './ops-stream-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return readString(value) ?? undefined;
}

export function parseEmergencyOpsSnapshot(data: unknown): EmergencyOpsSnapshot | null {
  if (!isRecord(data)) {
    return null;
  }

  const revision = data.revision;
  const active = data.active;
  const serverTime = readString(data.serverTime);
  if (typeof revision !== 'number' || typeof active !== 'boolean' || !serverTime) {
    return null;
  }

  const emergencyId = readNullableString(data.emergencyId);
  const raisedAt = readNullableString(data.raisedAt);
  const acknowledgedAt = readNullableString(data.acknowledgedAt);
  if (emergencyId === undefined || raisedAt === undefined || acknowledgedAt === undefined) {
    return null;
  }

  return {
    revision,
    active,
    emergencyId,
    raisedAt,
    acknowledgedAt,
    serverTime,
  };
}

export function parseDevicePresenceOpsSnapshot(data: unknown): DevicePresenceOpsSnapshot | null {
  if (!isRecord(data)) {
    return null;
  }

  const revision = data.revision;
  const deviceId = readString(data.deviceId);
  const kind = data.kind;
  const status = data.status;
  const streamConnected = data.streamConnected;
  const serverTime = readString(data.serverTime);
  if (
    typeof revision !== 'number' ||
    !deviceId ||
    (kind !== 'tv' && kind !== 'terminal' && kind !== 'room-panel') ||
    (status !== 'online' && status !== 'stale' && status !== 'offline') ||
    typeof streamConnected !== 'boolean' ||
    !serverTime
  ) {
    return null;
  }

  const lastSeenAt = readNullableString(data.lastSeenAt);
  if (lastSeenAt === undefined) {
    return null;
  }

  return {
    revision,
    deviceId,
    kind,
    status,
    streamConnected,
    lastSeenAt,
    serverTime,
  };
}

export function parseDevicePairingOpsSnapshot(data: unknown): DevicePairingOpsSnapshot | null {
  if (!isRecord(data)) {
    return null;
  }

  const revision = data.revision;
  const kind = data.kind;
  const phase = data.phase;
  const deviceId = readString(data.deviceId);
  const serverTime = readString(data.serverTime);
  if (
    typeof revision !== 'number' ||
    (kind !== 'tv' && kind !== 'terminal') ||
    (phase !== 'pending' && phase !== 'none') ||
    !deviceId ||
    !serverTime
  ) {
    return null;
  }

  const expiresAt = readString(data.expiresAt);

  return {
    revision,
    kind,
    phase,
    deviceId,
    ...(expiresAt ? { expiresAt } : {}),
    serverTime,
  };
}
