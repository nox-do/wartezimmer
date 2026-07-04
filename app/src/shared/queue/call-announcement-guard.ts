import { domainError } from '../errors/domain-error.js';
import { WAITING_ROOM_DEVICE_ID } from '../ops/device-ids.js';
import { isDeviceReachable } from '../ops/device-presence-registry.js';

/**
 * Devices that must receive queue call announcements (TV snapshot + chime).
 * v1: single waiting-room display. Later: room-scoped displays / in-room check-in devices.
 */
export function announcementDeviceIdsForQueueCall(): string[] {
  return [WAITING_ROOM_DEVICE_ID];
}

export function isAnnouncementDeviceReachable(deviceId: string, nowMs = Date.now()): boolean {
  return isDeviceReachable(deviceId, nowMs);
}

export function assertQueueCallAnnouncementReachable(nowMs = Date.now()): void {
  const offlineDeviceIds = announcementDeviceIdsForQueueCall().filter(
    (deviceId) => !isAnnouncementDeviceReachable(deviceId, nowMs),
  );

  if (offlineDeviceIds.length > 0) {
    throw domainError('CALL_ANNOUNCEMENT_OFFLINE');
  }
}
