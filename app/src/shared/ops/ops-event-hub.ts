import type { DevicePresenceStatus } from './device-presence-registry.js';

export type EmergencyOpsPayload = {
  revision: number;
  active: boolean;
  emergencyId: string | null;
  raisedAt: string | null;
  acknowledgedAt: string | null;
  serverTime: string;
};

export type DevicePresenceOpsPayload = {
  revision: number;
  deviceId: string;
  kind: 'tv' | 'terminal' | 'room-panel';
  status: DevicePresenceStatus;
  streamConnected: boolean;
  lastSeenAt: string | null;
  serverTime: string;
};

export type DevicePairingOpsPayload = {
  revision: number;
  kind: 'tv' | 'terminal';
  phase: 'pending' | 'none';
  deviceId: string;
  expiresAt?: string;
  serverTime: string;
};

export type OpsEventType = 'emergency' | 'device.presence' | 'device.pairing';

export type OpsEventEnvelope =
  | { type: 'emergency'; payload: EmergencyOpsPayload }
  | { type: 'device.presence'; payload: DevicePresenceOpsPayload }
  | { type: 'device.pairing'; payload: DevicePairingOpsPayload };

type OpsEventListener = (event: OpsEventEnvelope) => void;

const revisions: Record<OpsEventType, number> = {
  emergency: 0,
  'device.presence': 0,
  'device.pairing': 0,
};

const listeners = new Set<OpsEventListener>();

export function subscribeOpsStream(listener: OpsEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentOpsRevision(type: OpsEventType): number {
  return revisions[type];
}

function publishEnvelope(event: OpsEventEnvelope): OpsEventEnvelope {
  for (const listener of listeners) {
    listener(event);
  }
  return event;
}

export function publishOpsEvent(
  type: 'emergency',
  payload: Omit<EmergencyOpsPayload, 'revision' | 'serverTime'>,
): EmergencyOpsPayload;
export function publishOpsEvent(
  type: 'device.presence',
  payload: Omit<DevicePresenceOpsPayload, 'revision' | 'serverTime'>,
): DevicePresenceOpsPayload;
export function publishOpsEvent(
  type: 'device.pairing',
  payload: Omit<DevicePairingOpsPayload, 'revision' | 'serverTime'>,
): DevicePairingOpsPayload;
export function publishOpsEvent(type: OpsEventType, payload: Record<string, unknown>) {
  revisions[type] += 1;
  const envelopePayload = {
    revision: revisions[type],
    serverTime: new Date().toISOString(),
    ...payload,
  };

  const envelope: OpsEventEnvelope =
    type === 'emergency'
      ? { type, payload: envelopePayload as EmergencyOpsPayload }
      : type === 'device.presence'
        ? { type, payload: envelopePayload as DevicePresenceOpsPayload }
        : { type, payload: envelopePayload as DevicePairingOpsPayload };

  return publishEnvelope(envelope).payload;
}

export function resetOpsEventHubForTests(): void {
  revisions.emergency = 0;
  revisions['device.presence'] = 0;
  revisions['device.pairing'] = 0;
  listeners.clear();
}
