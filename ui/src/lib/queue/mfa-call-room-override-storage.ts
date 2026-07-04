import { listEnabledRooms } from './room-default-call-target';
import type { PracticeRoom } from '$lib/ops/openapi-types';

const CALL_ROOM_OVERRIDE_STORAGE_KEY = 'mfa:call-room-override-id';

function readStoredOverrideRaw(): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  const value = sessionStorage.getItem(CALL_ROOM_OVERRIDE_STORAGE_KEY)?.trim();
  return value && value.length > 0 ? value : null;
}

export function storeCallRoomOverrideId(roomId: string): void {
  sessionStorage.setItem(CALL_ROOM_OVERRIDE_STORAGE_KEY, roomId);
}

export function clearStoredCallRoomOverride(): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.removeItem(CALL_ROOM_OVERRIDE_STORAGE_KEY);
}

/** Returns stored override when still valid; null when off or unknown. */
export function readStoredCallRoomOverrideId(rooms: PracticeRoom[]): string | null {
  const storedRoomId = readStoredOverrideRaw();
  if (!storedRoomId) {
    return null;
  }
  if (listEnabledRooms(rooms).some((room) => room.roomId === storedRoomId)) {
    return storedRoomId;
  }
  clearStoredCallRoomOverride();
  return null;
}
