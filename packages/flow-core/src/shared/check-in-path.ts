import type { CheckInPath } from './types.js';

/**
 * Interne Topic-ID fuer den MFA-/Empfangs-Pfad.
 * Dieser Sonderfall repraesentiert keinen frei konfigurierbaren Praxis-Topic-Eintrag,
 * sondern den Systempfad hinter "Persoenliche Anmeldung" / MFA-Assist.
 */
export const MFA_ASSIST_TOPIC_ID = 'mfa';

export const CHECK_IN_PATHS = new Set<CheckInPath>(['topic', 'mfa_assist']);

/** Normalisiert optionale Topic-ID (leer → undefined). */
export function normalizeCheckInTopicId(topicId: string | undefined): string | undefined {
  return typeof topicId === 'string' && topicId.trim() ? topicId.trim() : undefined;
}

/**
 * Fachliche Check-in-Invarianten (Library-Grenze).
 * Source of Truth fuer visit-service; Parser nutzen dieselbe Prüfung.
 */
export function assertCheckInCombination(params: {
  topicId?: string;
  mfaAssist?: boolean;
  needsAssistance?: boolean;
}): void {
  const mfaAssist = Boolean(params.mfaAssist);
  const needsAssistance = Boolean(params.needsAssistance);
  const topicId = normalizeCheckInTopicId(params.topicId);

  if (mfaAssist && (topicId || needsAssistance)) throw new Error('CHECKIN_MFA_ASSIST_EXCLUSIVE');
  if (needsAssistance && !topicId) throw new Error('CHECKIN_ASSISTANCE_REQUIRES_TOPIC');
  if (!mfaAssist && !topicId) throw new Error('CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED');
}
