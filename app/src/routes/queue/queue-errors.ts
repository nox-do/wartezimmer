import type { FastifyReply } from 'fastify';
import {
  resolveDomainError,
  sendApiError,
  sendDomainError,
} from '../../http/domain-error-mapper.js';

export function handleQueueRouteError(
  reply: FastifyReply,
  ticketId: string,
  error: unknown,
  options: {
    invalidTransitionMessage: string;
    missingCallbackPhoneMessage?: string;
    recallNotifyRetryNotAllowedMessage?: string;
    recallWindowExpiredMessage?: string;
    roomRequiredMessage?: string;
    roomAtCapacityMessage?: string;
    callAnnouncementOfflineMessage?: string;
    roomScopeMismatchMessage?: string;
  },
): boolean {
  const resolved = resolveDomainError(error);

  if (resolved?.code === 'TICKET_NOT_FOUND') {
    sendApiError(reply, 404, {
      code: 'TICKET_NOT_FOUND',
      message: `Ticket ${ticketId} wurde nicht gefunden.`,
    });
    return true;
  }

  if (resolved?.code === 'INVALID_TRANSITION') {
    sendApiError(reply, 409, {
      code: 'INVALID_TRANSITION',
      message: options.invalidTransitionMessage,
    });
    return true;
  }

  if (options.roomRequiredMessage && resolved?.code === 'ROOM_REQUIRED') {
    sendApiError(reply, 400, {
      code: 'INVALID_ARGUMENT',
      message: options.roomRequiredMessage,
    });
    return true;
  }

  if (options.roomAtCapacityMessage && resolved?.code === 'ROOM_AT_CAPACITY') {
    sendApiError(reply, 409, {
      code: 'ROOM_AT_CAPACITY',
      message: options.roomAtCapacityMessage,
    });
    return true;
  }

  if (options.missingCallbackPhoneMessage && resolved?.code === 'MISSING_CALLBACK_PHONE') {
    sendApiError(reply, 400, {
      code: 'MISSING_CALLBACK_PHONE',
      message: options.missingCallbackPhoneMessage,
    });
    return true;
  }

  if (
    options.recallNotifyRetryNotAllowedMessage &&
    resolved?.code === 'RECALL_NOTIFY_RETRY_NOT_ALLOWED'
  ) {
    sendApiError(reply, 409, {
      code: 'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
      message: options.recallNotifyRetryNotAllowedMessage,
    });
    return true;
  }

  if (options.recallWindowExpiredMessage && resolved?.code === 'RECALL_WINDOW_EXPIRED') {
    sendApiError(reply, 409, {
      code: 'RECALL_WINDOW_EXPIRED',
      message: options.recallWindowExpiredMessage,
    });
    return true;
  }

  if (options.callAnnouncementOfflineMessage && resolved?.code === 'CALL_ANNOUNCEMENT_OFFLINE') {
    sendApiError(reply, 409, {
      code: 'CALL_ANNOUNCEMENT_OFFLINE',
      message: options.callAnnouncementOfflineMessage,
    });
    return true;
  }

  if (
    options.roomScopeMismatchMessage &&
    (resolved?.code === 'QUEUE_ROOM_MISMATCH' || resolved?.rawMessage === 'QUEUE_ROOM_MISMATCH')
  ) {
    sendApiError(reply, 409, {
      code: 'QUEUE_ROOM_MISMATCH',
      message: options.roomScopeMismatchMessage,
    });
    return true;
  }

  return sendDomainError(reply, error);
}
