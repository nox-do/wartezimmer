/**
 * Backwards-compatible re-export.
 * DomainError lives in `shared/errors`; HTTP mapping stays in `domain-error-codes.ts`.
 */
export { DomainError, domainError, readDomainCode } from '../shared/errors/domain-error.js';
