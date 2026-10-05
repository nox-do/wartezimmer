import { tf } from '$lib/i18n/i18nStore.svelte';
import { ROOM_BLOCKED_CAPACITY } from '$lib/queue/room-capacity';

export const ROOM_BLOCKED_TOPICS = 'ROOM_BLOCKED_TOPICS';
export const ROOM_BLOCKED_QUEUE = 'ROOM_BLOCKED_QUEUE';
export { ROOM_BLOCKED_CAPACITY } from '$lib/queue/room-capacity';

export type RoomQueueGuardContext = 'remove' | 'disable' | 'edit';

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

/** Map server room-guard API errors to staff-facing German copy. */
export function roomGuardErrorMessage(
  error: RoomGuardError,
  context: RoomQueueGuardContext = 'edit',
): string {
  const { topics, tickets } = guardDetails(error);
  if (error.code === ROOM_BLOCKED_TOPICS && topics) {
    return tf('mfa.settings.roomRemoveBlockedTopics', { topics });
  }
  if (error.code === ROOM_BLOCKED_QUEUE && tickets) {
    const key = {
      disable: 'mfa.settings.roomDisableBlockedQueue',
      remove: 'mfa.settings.roomRemoveBlockedQueue',
      edit: 'mfa.settings.roomEditBlockedQueue',
    } as const;
    return tf(key[context], { tickets });
  }
  if (error.code === ROOM_BLOCKED_CAPACITY && tickets) {
    return tf('mfa.settings.roomCapacityBlockedQueue', { tickets });
  }
  return error.message;
}
