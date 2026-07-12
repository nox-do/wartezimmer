import type { QueueItem } from './types';

/**
 * MFA Active-Zone primary button for tickets already in a room.
 *
 * Precedence: Weiter (hop done, next pending) → Starten → Entlassen.
 */
export type MfaInRoomPrimaryAction = 'start' | 'continue' | 'checkout';

export type MfaPrimaryActionInput = Pick<
  QueueItem,
  'status' | 'startedAt' | 'journeyStepCompletedAt'
>;

export function resolveMfaInRoomPrimaryAction(
  item: MfaPrimaryActionInput,
): MfaInRoomPrimaryAction | null {
  if (item.status !== 'in_room') {
    return null;
  }
  if (item.journeyStepCompletedAt) {
    return 'continue';
  }
  if (!item.startedAt) {
    return 'start';
  }
  return 'checkout';
}
