import type { CheckInPath } from './types.js';

/**
 * Interne Topic-ID fuer den MFA-/Empfangs-Pfad.
 * Dieser Sonderfall repraesentiert keinen frei konfigurierbaren Praxis-Topic-Eintrag,
 * sondern den Systempfad hinter "Persoenliche Anmeldung" / MFA-Assist.
 */
export const MFA_ASSIST_TOPIC_ID = 'mfa';

export const CHECK_IN_PATHS = new Set<CheckInPath>(['topic', 'mfa_assist']);
