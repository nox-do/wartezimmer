import type { PracticeRoom, PracticeTopicSetting } from './ops-settings-api';
import { defaultCallRoom, listEnabledRooms } from './room-default-call-target';

export const MFA_ASSIST_LANE_CODE = 'M';

export function isReservedLaneCode(value: string): boolean {
  return value.trim().toUpperCase() === MFA_ASSIST_LANE_CODE;
}

export function syncTopicDefaultRooms(
  topics: PracticeTopicSetting[],
  rooms: PracticeRoom[],
): PracticeTopicSetting[] {
  const enabledRooms = listEnabledRooms(rooms);
  const enabledIds = new Set(enabledRooms.map((room) => room.roomId));
  const fallback = defaultCallRoom(rooms)?.roomId ?? enabledRooms[0]?.roomId ?? '';

  return topics.map((topic) => ({
    ...topic,
    defaultRoomId: enabledIds.has(topic.defaultRoomId) ? topic.defaultRoomId : fallback,
  }));
}

export function roomLabelById(rooms: PracticeRoom[], roomId: string): string {
  return rooms.find((room) => room.roomId === roomId)?.roomLabel ?? roomId;
}

export function reconcileTopicsWithRooms(
  topics: PracticeTopicSetting[],
  rooms: PracticeRoom[],
): PracticeTopicSetting[] {
  return syncTopicDefaultRooms(topics, rooms);
}
