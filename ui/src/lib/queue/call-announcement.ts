import { isDeviceStreamConnected } from '$lib/mfa/ops-stream-store.svelte';
import { WAITING_ROOM_DEVICE_ID } from '$lib/ops/device-presence-api';

/** Devices that must be online for MFA queue calls (v1: waiting-room TV). */
export function announcementDeviceIdsForQueueCall(): string[] {
  return [WAITING_ROOM_DEVICE_ID];
}

export function isQueueCallAnnouncementReachable(): boolean {
  return announcementDeviceIdsForQueueCall().every((deviceId) => isDeviceStreamConnected(deviceId));
}
