import type { RoomPanelPlacement } from '$lib/queue/ops-settings-api';

export const WAITING_ROOM_DEVICE_ID = 'waiting-room';
export const TERMINAL_DEVICE_ID = 'checkin-terminal';

export type DevicePresenceStatus = 'online' | 'stale' | 'offline';

export function roomPanelDeviceId(roomId: string, placement: RoomPanelPlacement): string {
  return `room-panel:${roomId}:${placement}`;
}
