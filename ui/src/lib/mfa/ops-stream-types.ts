export type EmergencyOpsSnapshot = {
  revision: number;
  active: boolean;
  emergencyId: string | null;
  raisedAt: string | null;
  acknowledgedAt: string | null;
  serverTime: string;
};

export type DevicePresenceOpsSnapshot = {
  revision: number;
  deviceId: string;
  kind: 'tv' | 'terminal' | 'room-panel';
  status: 'online' | 'stale' | 'offline';
  streamConnected: boolean;
  lastSeenAt: string | null;
  serverTime: string;
};

export type DevicePairingOpsSnapshot = {
  revision: number;
  kind: 'tv' | 'terminal';
  phase: 'pending' | 'none';
  deviceId: string;
  expiresAt?: string;
  serverTime: string;
};
