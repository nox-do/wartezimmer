import type { CheckInPath } from './types.js';

/** PoC-Seed: interne Topic-ID fuer Hilfe-RoutingRule — kein konfigurierbares Praxis-Thema. Host: mfaAssist + checkInPath. */
export const MFA_ASSIST_TOPIC_ID = 'mfa';

export const CHECK_IN_PATHS = new Set<CheckInPath>(['topic', 'mfa_assist']);
