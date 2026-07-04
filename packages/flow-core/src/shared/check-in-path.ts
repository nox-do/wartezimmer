import type { CheckInPath } from './types.js';

/** System-Topic fuer Terminal-Hilfe-Button („Zur MFA“) — nicht in Terminal-Themenauswahl. */
export const MFA_ASSIST_TOPIC_ID = 'mfa';

export const CHECK_IN_PATHS = new Set<CheckInPath>(['topic', 'mfa_assist']);
