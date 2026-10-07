import { domainError } from '../errors/domain-error.js';
import type { OpsSettings, QueueVisitRow } from '../db/db-types.js';
import { formatTicketCode } from '../queue/ticket-code.js';
import {
  ROOM_AT_CAPACITY,
  ROOM_BLOCKED_CAPACITY,
  ROOM_OCCUPYING_STATUSES,
  countRoomOccupants as domainCountRoomOccupants,
  countRoomOccupantsExcluding as domainCountRoomOccupantsExcluding,
  isRoomOccupyingStatus,
  normalizeMaxOccupancy,
  parseMaxOccupancy,
  resolveRoomMaxOccupancy,
  roomHasCapacity as domainRoomHasCapacity,
  type RoomOccupantWithId,
} from '@wartezimmer/domain';

export {
  ROOM_AT_CAPACITY,
  ROOM_BLOCKED_CAPACITY,
  ROOM_OCCUPYING_STATUSES,
  isRoomOccupyingStatus,
  normalizeMaxOccupancy,
  parseMaxOccupancy,
  resolveRoomMaxOccupancy,
};

export type RoomOccupantVisit = Pick<QueueVisitRow, 'roomId' | 'status'>;
export type RoomOccupantVisitWithId = RoomOccupantVisit & Pick<QueueVisitRow, 'id'>;

function toDomainOccupants(tickets: readonly RoomOccupantVisitWithId[]): RoomOccupantWithId[] {
  return tickets.map((ticket) => ({
    roomId: ticket.roomId,
    status: ticket.status,
    occupantId: ticket.id,
  }));
}

export function countRoomOccupants(tickets: readonly RoomOccupantVisit[], roomId: string): number {
  return domainCountRoomOccupants(tickets, roomId);
}

export function countRoomOccupantsExcluding(
  tickets: readonly RoomOccupantVisitWithId[],
  roomId: string,
  excludeVisitId: string,
): number {
  return domainCountRoomOccupantsExcluding(toDomainOccupants(tickets), roomId, excludeVisitId);
}

export function roomHasCapacity(
  settings: Pick<OpsSettings, 'rooms'>,
  tickets: readonly RoomOccupantVisitWithId[],
  roomId: string,
  excludeVisitId?: string,
): boolean {
  return domainRoomHasCapacity(settings.rooms, toDomainOccupants(tickets), roomId, excludeVisitId);
}

export function assertRoomHasCapacity(
  settings: Pick<OpsSettings, 'rooms'>,
  tickets: readonly RoomOccupantVisitWithId[],
  roomId: string,
  excludeVisitId?: string,
): void {
  if (roomHasCapacity(settings, tickets, roomId, excludeVisitId)) {
    return;
  }
  throw domainError(ROOM_AT_CAPACITY);
}

export function occupyingTicketCodesForRoom(
  tickets: readonly Pick<QueueVisitRow, 'laneCode' | 'number' | 'roomId' | 'status'>[],
  roomId: string,
): string[] {
  return tickets
    .filter((ticket) => ticket.roomId === roomId && isRoomOccupyingStatus(ticket.status))
    .map((ticket) => formatTicketCode(ticket.laneCode, ticket.number));
}

export function validateRoomCapacitySettingsChange(input: {
  nextRooms: OpsSettings['rooms'];
  queueTickets: readonly Pick<QueueVisitRow, 'laneCode' | 'number' | 'roomId' | 'status'>[];
}):
  | { ok: true }
  | {
      ok: false;
      code: typeof ROOM_BLOCKED_CAPACITY;
      message: string;
      details: { tickets: string };
    } {
  for (const room of input.nextRooms) {
    const maxOccupancy = resolveRoomMaxOccupancy(input.nextRooms, room.roomId);
    if (maxOccupancy == null) {
      continue;
    }
    const count = countRoomOccupants(input.queueTickets, room.roomId);
    if (count > maxOccupancy) {
      return {
        ok: false,
        code: ROOM_BLOCKED_CAPACITY,
        message: 'Room maxOccupancy is below current occupancy.',
        details: {
          tickets: occupyingTicketCodesForRoom(input.queueTickets, room.roomId).join(', '),
        },
      };
    }
  }
  return { ok: true };
}
