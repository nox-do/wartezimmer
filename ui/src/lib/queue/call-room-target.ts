import type { QueueItem } from './types';
import type { PracticeRoom } from './ops-settings-api';
import type { RoomTarget } from './room-target';
import { roomTargetFromTicketDestination } from './room-target';
import { isWaitingRoomLocationId } from '@wartezimmer/domain';

export type CallRoomTargetOptions = {
  rooms: readonly (Pick<PracticeRoom, 'roomId' | 'enabled'> &
    Partial<Pick<PracticeRoom, 'roomLabel'>>)[];
  routingMode: 'simple' | 'complex';
  postWaitingCallTargetId: string | null;
  callRoomOverrideId: string | null;
};

export function nextCallRoomOverrideId(
  selectedRoomId: string,
  currentOverrideId: string | null,
  persistedTargetId: string | null,
): string | null {
  return selectedRoomId === currentOverrideId || selectedRoomId === persistedTargetId
    ? null
    : selectedRoomId;
}

export function resolveCallRoomTarget(
  item: QueueItem | undefined,
  options?: CallRoomTargetOptions,
): RoomTarget | undefined {
  const ticketTarget = roomTargetFromTicketDestination(item);
  if (
    !options ||
    !item ||
    !isWaitingRoomLocationId(item.destinationRoomId) ||
    options.routingMode !== 'simple' ||
    item.status !== 'waiting' ||
    (item.movementMode !== 'call' && item.movementMode != null) ||
    item.needsAssistance === true
  ) {
    return ticketTarget;
  }

  const targetId = options.callRoomOverrideId ?? options.postWaitingCallTargetId;
  const room = options.rooms.find(
    (candidate) => candidate.enabled && candidate.roomId === targetId,
  );
  return room
    ? { roomId: room.roomId, roomLabel: room.roomLabel?.trim() || room.roomId }
    : ticketTarget;
}
