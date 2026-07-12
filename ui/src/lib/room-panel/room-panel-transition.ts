import type { Result } from '$lib/types/result';

export type RoomPanelTransitionOutcome =
  | { kind: 'success' }
  | { kind: 'conflict'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'sessionExpired'; message: string }
  | { kind: 'error'; message: string };

type TransitionError = {
  message: string;
  status?: number;
};

export function resolveRoomPanelTransitionOutcome(
  result: Result<unknown>,
  fallbackMessage: string,
): RoomPanelTransitionOutcome {
  if (result.ok) {
    return { kind: 'success' };
  }

  const error = result.error as TransitionError;
  const message = error.message?.trim() || fallbackMessage;

  if (error.status === 401) {
    return { kind: 'sessionExpired', message };
  }
  if (error.status === 409) {
    return { kind: 'conflict', message };
  }
  if (error.status === 403) {
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

  const error = result.error as TransitionError;
  const message = error.message?.trim() || fallbackMessage;

  if (error.status === 401 || error.status === 403) {
    return { kind: 'sessionExpired', message };
  }

  return { kind: 'error', message };
}
