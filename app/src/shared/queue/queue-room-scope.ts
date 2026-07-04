import { domainError } from '../errors/domain-error.js';

export const QUEUE_ROOM_MISMATCH = 'QUEUE_ROOM_MISMATCH';

/** When set, check-in/out must match the ticket's assigned `room_id` (room panel). Omit for MFA. */
export function assertQueueRoomScope(assignedRoomId: string | null, actingRoomId?: string): void {
  const scopedRoomId = actingRoomId?.trim();
  if (!scopedRoomId) {
    return;
  }
  if (!assignedRoomId || assignedRoomId !== scopedRoomId) {
    throw domainError(QUEUE_ROOM_MISMATCH);
  }
}
