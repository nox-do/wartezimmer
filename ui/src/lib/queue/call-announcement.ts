import { isDeviceStreamConnected } from '$lib/mfa/ops-stream-store.svelte';
import { WAITING_ROOM_DEVICE_ID } from '$lib/ops/device-presence-api';

/**
 * UX-only hint from the MFA SSE stream (v1: waiting-room TV).
 * Authoritative reachability for calls is decided by the server presence registry.
 */
export function announcementDeviceIdsForQueueCall(): string[] {
  return [WAITING_ROOM_DEVICE_ID];
}

/** SSE-based status for UI warnings — not a hard gate for queue call commands. */
export function isQueueCallAnnouncementReachable(): boolean {
  return announcementDeviceIdsForQueueCall().every((deviceId) => isDeviceStreamConnected(deviceId));
}
