import type { DeviceSessionRole } from '../../auth/staff-session-auth.js';
import { TERMINAL_DEVICE_ID, WAITING_ROOM_DEVICE_ID } from './device-ids.js';

export function deviceKindForPairedRole(role: DeviceSessionRole): 'tv' | 'terminal' {
  return role === 'tv' ? 'tv' : 'terminal';
}

export function defaultDeviceIdForPairedRole(role: DeviceSessionRole): string {
  return role === 'tv' ? WAITING_ROOM_DEVICE_ID : TERMINAL_DEVICE_ID;
}

export function pairedRoleForDeviceKind(kind: 'tv' | 'terminal'): DeviceSessionRole {
  return kind;
}
