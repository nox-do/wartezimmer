import type { Result } from '$lib/types/result';

export type RoomPanelTransitionOutcome =
  | { kind: 'success' }
  | { kind: 'conflict'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'sessionExpired'; message: string }
  | { kind: 'error'; message: string };

export function resolveRoomPanelTransitionOutcome(
  result: Result<unknown>,
  fallbackMessage: string,
): RoomPanelTransitionOutcome {
  if (result.ok) {
    return { kind: 'success' };
  }

  const message = result.error.message?.trim() || fallbackMessage;

  if (result.error.status === 401) {
    return { kind: 'sessionExpired', message };
  }
  if (result.error.status === 409) {
    return { kind: 'conflict', message };
  }
  if (result.error.status === 403) {
    return { kind: 'forbidden', message };
  }

  return { kind: 'error', message };
}

export function resolveRoomPanelQueueFetchOutcome(
  result: Result<unknown>,
  fallbackMessage: string,
): RoomPanelTransitionOutcome {
  if (result.ok) {
    return { kind: 'success' };
  }

  const message = result.error.message?.trim() || fallbackMessage;

  if (result.error.status === 401 || result.error.status === 403) {
    return { kind: 'sessionExpired', message };
  }

  return { kind: 'error', message };
}
