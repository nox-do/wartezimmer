import type { FastifyReply } from 'fastify';
import type { ApiErrorPayload } from './api-errors.js';

export {
  isExpectedDomainError,
  isKnownDomainErrorCode,
  resolveDomainError,
  sendDomainError,
  sendResolvedDomainError,
} from './domain-error-codes.js';
export type {
  DomainErrorCode,
  DomainErrorMessageOverrides,
  ResolvedDomainError,
} from './domain-error-codes.js';
export { DomainError, domainError, readDomainCode } from './domain-error.js';

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  payload: ApiErrorPayload,
): void {
  void reply.code(statusCode).send(payload);
}
