import { isReservedLaneCode, MFA_ASSIST_LANE_CODE } from '@praxis-flow/domain';
import type { PracticeRoom, PracticeTopicSetting } from './ops-settings-api';

/** Re-export canonical reserved-lane helpers from `@praxis-flow/domain`. */
export { MFA_ASSIST_LANE_CODE, isReservedLaneCode };

/** Topics whose `defaultRoomId` is not present in the room list (e.g. after remove/rename). */
export function topicsReferencingMissingRooms(
  topics: readonly PracticeTopicSetting[],
  rooms: readonly PracticeRoom[],
): PracticeTopicSetting[] {
  const roomIds = new Set(rooms.map((room) => room.roomId));
  return topics.filter((topic) => !roomIds.has(topic.defaultRoomId));
}

export function formatTopicLabels(topics: readonly Pick<PracticeTopicSetting, 'label'>[]): string {
  return topics.map((topic) => topic.label).join(', ');
}

export function roomLabelById(rooms: PracticeRoom[], roomId: string): string {
  return rooms.find((room) => room.roomId === roomId)?.roomLabel ?? roomId;
}
