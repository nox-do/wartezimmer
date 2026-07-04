import { formatTicketCode } from '@praxis-flow/domain';
import { tf } from '$lib/i18n/i18nStore.svelte';
import type { PracticeTopicSetting } from '$lib/queue/ops-settings-api';
import { isRoomOccupyingStatus, ROOM_BLOCKED_CAPACITY } from '$lib/queue/room-capacity';
import type { QueueItem } from '$lib/queue/types';

export const ROOM_BLOCKED_TOPICS = 'ROOM_BLOCKED_TOPICS';
export const ROOM_BLOCKED_QUEUE = 'ROOM_BLOCKED_QUEUE';
export { ROOM_BLOCKED_CAPACITY } from '$lib/queue/room-capacity';

export function topicsUsingRoom(
  topics: PracticeTopicSetting[],
  roomId: string,
): PracticeTopicSetting[] {
  return topics.filter((topic) => topic.defaultRoomId === roomId);
}

export function queueTicketsOccupyingRoom(items: QueueItem[], roomId: string): QueueItem[] {
  return items.filter((item) => item.roomId === roomId && isRoomOccupyingStatus(item.status));
}

export function queueTicketsUsingRoom(items: QueueItem[], roomId: string): QueueItem[] {
  return items.filter((item) => item.roomId === roomId);
}

export function formatTopicLabels(topics: PracticeTopicSetting[]): string {
  return topics.map((topic) => topic.label).join(', ');
}

export function formatQueueTicketLabels(items: QueueItem[]): string {
  return items.map((item) => formatTicketCode(item.laneCode, item.number)).join(', ');
}

type RoomGuardError = {
  code?: string;
  message: string;
  details?: unknown;
};

function guardDetails(error: RoomGuardError): { topics?: string; tickets?: string } {
  const details = error.details;
  if (!details || typeof details !== 'object') {
    return {};
  }
  const record = details as Record<string, unknown>;
  return {
    topics: typeof record.topics === 'string' ? record.topics : undefined,
    tickets: typeof record.tickets === 'string' ? record.tickets : undefined,
  };
}

export function roomGuardErrorMessage(
  error: RoomGuardError,
  context: 'remove' | 'disable' = 'remove',
): string {
  const { topics, tickets } = guardDetails(error);
  if (error.code === ROOM_BLOCKED_TOPICS && topics) {
    return tf('mfa.settings.roomRemoveBlockedTopics', { topics });
  }
  if (error.code === ROOM_BLOCKED_QUEUE && tickets) {
    return context === 'disable'
      ? tf('mfa.settings.roomDisableBlockedQueue', { tickets })
      : tf('mfa.settings.roomRemoveBlockedQueue', { tickets });
  }
  if (error.code === ROOM_BLOCKED_CAPACITY && tickets) {
    return tf('mfa.settings.roomCapacityBlockedQueue', { tickets });
  }
  return error.message;
}
