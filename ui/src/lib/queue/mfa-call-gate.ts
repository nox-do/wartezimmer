import type { QueueItem } from './types';

export type MfaCallGateInput = Pick<
  QueueItem,
  'status' | 'movementMode' | 'destinationRoomLabel' | 'roomLabel'
>;

export type MfaCallBlockedReason =
  | { kind: 'directed'; roomLabel: string | null }
  | { kind: 'pickup'; roomLabel: string | null }
  | { kind: 'other' };

/**
 * MFA Aufrufen only for patients waiting on a call hop.
 * directed/self_go and pickup stay visible; Call is shown disabled with a reason.
 */
export function canMfaCallVisit(item: Pick<QueueItem, 'status' | 'movementMode'>): boolean {
  if (item.status !== 'waiting') {
    return false;
  }
  return item.movementMode === 'call' || item.movementMode == null;
}

function roomLabelOf(item: MfaCallGateInput): string | null {
  const label = item.destinationRoomLabel?.trim() || item.roomLabel?.trim() || '';
  return label || null;
}

/** Null when Call is allowed; otherwise why it is blocked + what to do instead. */
export function resolveMfaCallBlockedReason(item: MfaCallGateInput): MfaCallBlockedReason | null {
  if (canMfaCallVisit(item)) {
    return null;
  }
  if (item.status === 'directed' || item.movementMode === 'self_go') {
    return { kind: 'directed', roomLabel: roomLabelOf(item) };
  }
  if (item.status === 'waiting' && item.movementMode === 'pickup') {
    return { kind: 'pickup', roomLabel: roomLabelOf(item) };
  }
  return { kind: 'other' };
}
