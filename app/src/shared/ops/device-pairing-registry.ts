import { randomInt, randomUUID } from 'node:crypto';
import type { DeviceSessionRole } from '../../auth/staff-session-auth.js';
import {
  publishOpsEvent,
  currentOpsRevision,
  type DevicePairingOpsPayload,
} from './ops-event-hub.js';
import { defaultDeviceIdForPairedRole, deviceKindForPairedRole } from './device-role.js';

export type DevicePairingRecord = {
  pairingId: string;
  role: DeviceSessionRole;
  code: string;
  displayId: string;
  expiresAtMs: number;
  deviceToken?: string;
  sessionId?: string;
};

const DEVICE_PAIRING_TTL_MS =
  Number.parseInt(
    process.env.DEVICE_PAIRING_TTL_MS ?? process.env.TV_PAIRING_TTL_MS ?? '300000',
    10,
  ) || 300_000;
const DEVICE_PAIRING_MAX_PENDING =
  Number.parseInt(process.env.DEVICE_PAIRING_MAX_PENDING ?? '50', 10) || 50;
const DEVICE_PAIRING_CODE_ATTEMPTS = 20;
const DEVICE_PAIRING_CONFIRMED_POLL_TTL_MS =
  Number.parseInt(process.env.DEVICE_PAIRING_CONFIRMED_POLL_TTL_MS ?? '60000', 10) || 60_000;

const devicePairingsById = new Map<string, DevicePairingRecord>();
const pairingExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const confirmedPollTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pairingEpochByRole: Record<DeviceSessionRole, number> = {
  tv: 0,
  terminal: 0,
};

export function currentPairingEpoch(role: DeviceSessionRole): number {
  return pairingEpochByRole[role];
}

function clearPairingExpiryTimer(pairingId: string): void {
  const timer = pairingExpiryTimers.get(pairingId);
  if (timer) {
    clearTimeout(timer);
    pairingExpiryTimers.delete(pairingId);
  }
}

function clearConfirmedPollTimer(pairingId: string): void {
  const timer = confirmedPollTimers.get(pairingId);
  if (timer) {
    clearTimeout(timer);
    confirmedPollTimers.delete(pairingId);
  }
}

function scheduleConfirmedPollCleanup(pairingId: string): void {
  clearConfirmedPollTimer(pairingId);
  const timer = setTimeout(() => {
    confirmedPollTimers.delete(pairingId);
    const pairing = devicePairingsById.get(pairingId);
    if (!pairing?.deviceToken) {
      return;
    }
    clearPairingExpiryTimer(pairingId);
    devicePairingsById.delete(pairingId);
    publishPairingSnapshotForRole(pairing.role, true);
  }, DEVICE_PAIRING_CONFIRMED_POLL_TTL_MS);
  timer.unref();
  confirmedPollTimers.set(pairingId, timer);
}

function schedulePairingExpiry(pairingId: string, expiresAtMs: number): void {
  clearPairingExpiryTimer(pairingId);
  const delayMs = Math.max(0, expiresAtMs - Date.now());
  const timer = setTimeout(() => {
    pairingExpiryTimers.delete(pairingId);
    const pairing = devicePairingsById.get(pairingId);
    if (!pairing || pairing.deviceToken || pairing.expiresAtMs > Date.now()) {
      return;
    }
    devicePairingsById.delete(pairingId);
    publishPairingSnapshotForRole(pairing.role, true);
  }, delayMs);
  timer.unref();
  pairingExpiryTimers.set(pairingId, timer);
}

function createDevicePairingCode(existingCodes: Set<string>): string | null {
  for (let attempt = 0; attempt < DEVICE_PAIRING_CODE_ATTEMPTS; attempt += 1) {
    const code = String(randomInt(0, 10_000)).padStart(4, '0');
    if (!existingCodes.has(code)) {
      return code;
    }
  }

  return null;
}

export function pruneExpiredPairings(nowMs = Date.now()): void {
  for (const [pairingId, pairing] of devicePairingsById) {
    if (pairing.deviceToken) {
      continue;
    }
    if (pairing.expiresAtMs <= nowMs) {
      clearPairingExpiryTimer(pairingId);
      devicePairingsById.delete(pairingId);
      publishPairingSnapshotForRole(pairing.role, true);
    }
  }
}

function buildPairingSnapshot(
  role: DeviceSessionRole,
): Omit<DevicePairingOpsPayload, 'revision' | 'serverTime'> {
  pruneExpiredPairings();
  const pairing = [...devicePairingsById.values()].find(
    (candidate) => candidate.role === role && !candidate.deviceToken,
  );

  return {
    kind: deviceKindForPairedRole(role),
    phase: pairing ? 'pending' : 'none',
    deviceId: pairing?.displayId ?? defaultDeviceIdForPairedRole(role),
    ...(pairing ? { expiresAt: new Date(pairing.expiresAtMs).toISOString() } : {}),
  };
}

function publishPairingSnapshotForRole(
  role: DeviceSessionRole,
  publish: true,
): DevicePairingOpsPayload;
function publishPairingSnapshotForRole(
  role: DeviceSessionRole,
  publish: false,
): DevicePairingOpsPayload;
function publishPairingSnapshotForRole(
  role: DeviceSessionRole,
  publish: boolean,
): DevicePairingOpsPayload {
  const payload = buildPairingSnapshot(role);
  if (publish) {
    return publishOpsEvent('device.pairing', payload);
  }

  return {
    revision: currentOpsRevision('device.pairing'),
    ...payload,
    serverTime: new Date().toISOString(),
  };
}

export function currentDevicePairingSnapshot(role: DeviceSessionRole): DevicePairingOpsPayload {
  return publishPairingSnapshotForRole(role, false);
}

export function startDevicePairing(input: { role: DeviceSessionRole; displayId: string }) {
  pruneExpiredPairings();
  clearPendingPairingForRole(input.role);
  const activePairingsForRole = [...devicePairingsById.values()].filter(
    (pairing) => pairing.role === input.role,
  );
  if (activePairingsForRole.length >= DEVICE_PAIRING_MAX_PENDING) {
    return null;
  }
  const code = createDevicePairingCode(
    new Set(activePairingsForRole.map((pairing) => pairing.code)),
  );
  if (!code) {
    return null;
  }

  const pairingId = randomUUID();
  const expiresAtMs = Date.now() + DEVICE_PAIRING_TTL_MS;
  const pairing: DevicePairingRecord = {
    pairingId,
    role: input.role,
    code,
    displayId: input.displayId,
    expiresAtMs,
  };
  devicePairingsById.set(pairingId, pairing);
  pairingEpochByRole[input.role] += 1;
  schedulePairingExpiry(pairingId, expiresAtMs);
  publishPairingSnapshotForRole(input.role, true);

  return {
    pairingId,
    code: pairing.code,
    expiresAt: new Date(expiresAtMs).toISOString(),
    status: 'pending',
  };
}

export function confirmDevicePairing(role: DeviceSessionRole, code: string) {
  pruneExpiredPairings();
  const pairing = [...devicePairingsById.values()].find(
    (candidate) => candidate.role === role && candidate.code === code,
  );
  if (!pairing) {
    return null;
  }

  return pairing;
}

export function attachDeviceSessionToPairing(
  role: DeviceSessionRole,
  pairing: DevicePairingRecord,
  deviceToken: string,
  sessionId: string,
): void {
  pairing.deviceToken = deviceToken;
  pairing.sessionId = sessionId;
  clearPairingExpiryTimer(pairing.pairingId);
  scheduleConfirmedPollCleanup(pairing.pairingId);
  publishPairingSnapshotForRole(role, true);
}

export function isDevicePairingAlreadyConfirmed(pairing: DevicePairingRecord): boolean {
  return Boolean(pairing.deviceToken);
}

export function getDevicePairingById(pairingId: string): DevicePairingRecord | undefined {
  return devicePairingsById.get(pairingId);
}

export function removeDevicePairing(pairingId: string): DevicePairingRecord | undefined {
  const pairing = devicePairingsById.get(pairingId);
  if (!pairing) {
    return undefined;
  }
  clearPairingExpiryTimer(pairingId);
  clearConfirmedPollTimer(pairingId);
  devicePairingsById.delete(pairingId);
  publishPairingSnapshotForRole(pairing.role, true);
  return pairing;
}

export function hasPendingPairingForRole(role: DeviceSessionRole): boolean {
  pruneExpiredPairings();
  return [...devicePairingsById.values()].some(
    (pairing) => pairing.role === role && !pairing.deviceToken,
  );
}

export function clearPendingPairingForRole(role: DeviceSessionRole): boolean {
  pruneExpiredPairings();
  let cleared = false;
  for (const [pairingId, pairing] of devicePairingsById) {
    if (pairing.role === role && !pairing.deviceToken) {
      clearPairingExpiryTimer(pairingId);
      devicePairingsById.delete(pairingId);
      cleared = true;
    }
  }

  if (cleared) {
    publishPairingSnapshotForRole(role, true);
  }

  return cleared;
}

export function resetDevicePairingForTests(): void {
  for (const pairingId of pairingExpiryTimers.keys()) {
    clearPairingExpiryTimer(pairingId);
  }
  for (const pairingId of confirmedPollTimers.keys()) {
    clearConfirmedPollTimer(pairingId);
  }
  devicePairingsById.clear();
  pairingEpochByRole.tv = 0;
  pairingEpochByRole.terminal = 0;
}
