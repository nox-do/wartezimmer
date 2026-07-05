import type { TopicSetting } from '../checkin-topic-settings.js';
import type { OpsSettings, QueueVisitRow } from '../db/db-types.js';
import { formatTicketCode } from '../queue/ticket-code.js';
import { validateRoomCapacitySettingsChange, ROOM_BLOCKED_CAPACITY } from './room-capacity.js';

export const ROOM_BLOCKED_TOPICS = 'ROOM_BLOCKED_TOPICS';
export const ROOM_BLOCKED_QUEUE = 'ROOM_BLOCKED_QUEUE';
export { ROOM_BLOCKED_CAPACITY } from './room-capacity.js';

export function removedRoomIds(
  currentRooms: OpsSettings['rooms'],
  nextRooms: OpsSettings['rooms'],
): string[] {
  const nextIds = new Set(nextRooms.map((room) => room.roomId));
  return currentRooms.map((room) => room.roomId).filter((roomId) => !nextIds.has(roomId));
}

export function disabledRoomIds(
  currentRooms: OpsSettings['rooms'],
  nextRooms: OpsSettings['rooms'],
): string[] {
  const nextById = new Map(nextRooms.map((room) => [room.roomId, room]));
  return currentRooms
    .filter((room) => room.enabled && nextById.get(room.roomId)?.enabled === false)
    .map((room) => room.roomId);
}

function queueTicketsForRoomIds(
  roomIds: ReadonlySet<string>,
  queueTickets: readonly Pick<QueueVisitRow, 'laneCode' | 'number' | 'roomId' | 'status'>[],
): string[] {
  return queueTickets
    .filter((ticket) => ticket.roomId && roomIds.has(ticket.roomId))
    .map((ticket) => formatTicketCode(ticket.laneCode, ticket.number));
}

export type RoomSettingsGuardFailure = {
  ok: false;
  code: typeof ROOM_BLOCKED_TOPICS | typeof ROOM_BLOCKED_QUEUE | typeof ROOM_BLOCKED_CAPACITY;
  message: string;
  details: { topics?: string; tickets?: string };
};

export function validateRoomSettingsChange(input: {
  currentRooms: OpsSettings['rooms'];
  nextRooms: OpsSettings['rooms'];
  topics: readonly TopicSetting[];
  queueTickets: readonly Pick<QueueVisitRow, 'laneCode' | 'number' | 'roomId' | 'status'>[];
}): { ok: true } | RoomSettingsGuardFailure {
  const removed = removedRoomIds(input.currentRooms, input.nextRooms);
  if (removed.length > 0) {
    const removedSet = new Set(removed);
    const topicLabels = input.topics
      .filter((topic) => removedSet.has(topic.defaultRoomId))
      .map((topic) => topic.label);
    if (topicLabels.length > 0) {
      return {
        ok: false,
        code: ROOM_BLOCKED_TOPICS,
        message: 'Room is still referenced by terminal topics.',
        details: { topics: topicLabels.join(', ') },
      };
    }

    const ticketCodes = queueTicketsForRoomIds(removedSet, input.queueTickets);
    if (ticketCodes.length > 0) {
      return {
        ok: false,
        code: ROOM_BLOCKED_QUEUE,
        message: 'Room is still assigned to queue tickets.',
        details: { tickets: ticketCodes.join(', ') },
      };
    }
  }

  const disabled = disabledRoomIds(input.currentRooms, input.nextRooms);
  if (disabled.length > 0) {
    const disabledSet = new Set(disabled);
    const ticketCodes = queueTicketsForRoomIds(disabledSet, input.queueTickets);
    if (ticketCodes.length > 0) {
      return {
        ok: false,
        code: ROOM_BLOCKED_QUEUE,
        message: 'Room is still assigned to queue tickets.',
        details: { tickets: ticketCodes.join(', ') },
      };
    }
  }

  const capacityGuard = validateRoomCapacitySettingsChange({
    nextRooms: input.nextRooms,
    queueTickets: input.queueTickets,
  });
  if (!capacityGuard.ok) {
    return capacityGuard;
  }

  return { ok: true };
}
