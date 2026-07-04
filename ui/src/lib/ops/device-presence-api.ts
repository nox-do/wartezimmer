export const WAITING_ROOM_DEVICE_ID = 'waiting-room';
export const TERMINAL_DEVICE_ID = 'checkin-terminal';

export type DevicePresenceStatus = 'online' | 'stale' | 'offline';
export function roomPanelDeviceId(roomId: string): string {
  return `room-panel:${roomId}`;
}
