import type { RoomPanelPlacement } from '../db/db-types.js';

export const WAITING_ROOM_DEVICE_ID = 'waiting-room';
export const TERMINAL_DEVICE_ID = 'checkin-terminal';

export function roomPanelDeviceId(roomId: string, placement: RoomPanelPlacement): string {
  return `room-panel:${roomId}:${placement}`;
}
