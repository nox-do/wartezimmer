import { isWaitingRoomLocationId } from '@praxis-flow/domain';
import type { PracticeRoom } from './ops-settings-api';
import type { QueueItem } from './types';

type MfaCallTransitionInput = Pick<QueueItem, 'status' | 'movementMode'> &
  Partial<Pick<QueueItem, 'needsAssistance'>>;

export type MfaCallGateInput = Pick<
  QueueItem,
  'status' | 'movementMode' | 'destinationRoomId' | 'destinationRoomLabel' | 'roomLabel'
> &
  Partial<Pick<QueueItem, 'needsAssistance'>>;

export type MfaCallBlockedReason =
  | { kind: 'room_required' }
  | { kind: 'directed'; roomLabel: string | null }
  | { kind: 'pickup'; roomLabel: string | null }
  | { kind: 'other' };

/**
 * MFA Aufrufen only for patients waiting on a call hop.
 * directed/self_go and pickup stay visible; Call is shown disabled with a reason.
 */
export function canMfaCallTransition(item: MfaCallTransitionInput): boolean {
  if (item.status !== 'waiting' || item.needsAssistance === true) {
    return false;
  }
  return item.movementMode === 'call' || item.movementMode == null;
}

/** One-click Call can only use a concrete route target; DnD supplies its own room. */
export function hasValidMfaCallTarget(
  item: Pick<QueueItem, 'destinationRoomId'>,
  rooms: readonly Pick<PracticeRoom, 'roomId' | 'enabled'>[],
  resolvedCallTargetId?: string,
): boolean {
  const destinationRoomId = resolvedCallTargetId?.trim() || item.destinationRoomId?.trim();
  return (
    Boolean(destinationRoomId) &&
    !isWaitingRoomLocationId(destinationRoomId) &&
    rooms.some((room) => room.enabled && room.roomId === destinationRoomId)
  );
}

export function canMfaCallVisit(
  item: Pick<QueueItem, 'status' | 'movementMode' | 'destinationRoomId'> &
    Partial<Pick<QueueItem, 'needsAssistance'>>,
  rooms: readonly Pick<PracticeRoom, 'roomId' | 'enabled'>[],
  resolvedCallTargetId?: string,
): boolean {
  return canMfaCallTransition(item) && hasValidMfaCallTarget(item, rooms, resolvedCallTargetId);
}

export function isMfaPickupActionPending(
  item: Pick<QueueItem, 'status' | 'movementMode' | 'escortTransferPending'>,
): boolean {
  return (
    item.movementMode === 'pickup' &&
    (item.status === 'waiting' ||
      (item.status === 'in_room' && item.escortTransferPending === true))
  );
}

function roomLabelOf(item: MfaCallGateInput): string | null {
  const label = item.destinationRoomLabel?.trim() || item.roomLabel?.trim() || '';
  return label || null;
}

/** Null when Call is allowed; otherwise why it is blocked + what to do instead. */
export function resolveMfaCallBlockedReason(
  item: MfaCallGateInput,
  rooms: readonly Pick<PracticeRoom, 'roomId' | 'enabled'>[],
  resolvedCallTargetId?: string,
): MfaCallBlockedReason | null {
  if (canMfaCallVisit(item, rooms, resolvedCallTargetId)) {
    return null;
  }
  if (canMfaCallTransition(item)) {
    return { kind: 'room_required' };
  }
  if (item.status === 'directed' || item.movementMode === 'self_go') {
    return { kind: 'directed', roomLabel: roomLabelOf(item) };
  }
  if (item.status === 'waiting' && item.movementMode === 'pickup') {
    return { kind: 'pickup', roomLabel: roomLabelOf(item) };
  }
  return { kind: 'other' };
}
