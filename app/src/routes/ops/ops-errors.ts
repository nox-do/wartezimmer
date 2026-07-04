import type { FastifyReply } from 'fastify';
import type { ApiErrorCode } from '../../http/api-errors.js';
import { sendResolvedDomainError } from '../../http/domain-error-mapper.js';

export function handleOpsRouteError(
  reply: FastifyReply,
  error: unknown,
  options: {
    checkinLockRequiredMessage?: string;
    dayCloseInProgressMessage?: string;
    invalidDayClosePhaseMessage?: string;
    dayCloseNotStartedMessage?: string;
    unknownMessagingProviderMessage?: string;
    emergencyDisabledMessage?: string;
    emergencyNotFoundMessage?: string;
    checkinLockedMessage?: string;
  },
): boolean {
  const byApiCode: Partial<Record<ApiErrorCode, string>> = {};

  if (options.checkinLockRequiredMessage) {
    byApiCode.CHECKIN_LOCK_REQUIRED = options.checkinLockRequiredMessage;
  }
  if (options.dayCloseInProgressMessage) {
    byApiCode.DAY_CLOSE_IN_PROGRESS = options.dayCloseInProgressMessage;
  }
  if (options.invalidDayClosePhaseMessage) {
    byApiCode.INVALID_DAY_CLOSE_PHASE = options.invalidDayClosePhaseMessage;
  }
  if (options.dayCloseNotStartedMessage) {
    byApiCode.DAY_CLOSE_NOT_STARTED = options.dayCloseNotStartedMessage;
  }
  if (options.unknownMessagingProviderMessage) {
    byApiCode.UNKNOWN_MESSAGING_PROVIDER = options.unknownMessagingProviderMessage;
  }
  if (options.emergencyDisabledMessage) {
    byApiCode.EMERGENCY_DISABLED = options.emergencyDisabledMessage;
  }
  if (options.emergencyNotFoundMessage) {
    byApiCode.EMERGENCY_NOT_FOUND = options.emergencyNotFoundMessage;
  }
  if (options.checkinLockedMessage) {
    byApiCode.CHECKIN_LOCKED = options.checkinLockedMessage;
  }
  return sendResolvedDomainError(reply, error, { byApiCode });
}
