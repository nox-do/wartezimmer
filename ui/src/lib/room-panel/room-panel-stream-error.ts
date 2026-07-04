import { SSE_CLIENT_ERROR } from '$lib/api/sse-client';

export function isRoomPanelSessionExpiredError(message: string): boolean {
  return message === SSE_CLIENT_ERROR.unauthorized || message === SSE_CLIENT_ERROR.forbidden;
}
