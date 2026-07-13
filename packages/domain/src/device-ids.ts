import type { RoomPanelPlacement } from './room-panel-settings.js';

export const WAITING_ROOM_DEVICE_ID = 'waiting-room';
export const TERMINAL_DEVICE_ID = 'checkin-terminal';

export function roomPanelDeviceId(roomId: string, placement: RoomPanelPlacement): string {
  return `room-panel:${roomId}:${placement}`;
}
