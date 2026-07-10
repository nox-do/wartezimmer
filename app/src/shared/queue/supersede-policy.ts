import { domainError } from '../errors/domain-error.js';

/** Pre-arrival queue states (MFA waiting zone): waiting + directed (self_go). */
const SUPERSEDE_ALLOWED_CORE_STATUSES = new Set(['waiting', 'directed']);

/**
 * Host-Policy für Topic-Supersede (weit/generisch).
 * Nutzt Core-Visit-Status + Absent-Overlay — nicht die Queue-Display-Kollabierung.
 */
export function assertSupersedeAllowed(params: {
  /** flow-core Visit.status */
  coreStatus: string;
  /** Host absent overlay, if any */
  absentMode?: string | null;
  sourceTopicId: string;
  targetTopicId: string;
  targetTopicEnabled: boolean;
}): void {
  const topicId = params.targetTopicId.trim();
  if (!topicId) {
    throw domainError('INVALID_ARGUMENT');
  }
  if (!params.targetTopicEnabled) {
    throw domainError('TOPIC_DISABLED');
  }
  if (params.sourceTopicId === topicId) {
    throw domainError('INVALID_TRANSITION');
  }
  if (params.absentMode) {
    throw domainError('INVALID_TRANSITION');
  }
  if (!SUPERSEDE_ALLOWED_CORE_STATUSES.has(params.coreStatus)) {
    throw domainError('INVALID_TRANSITION');
  }
}
