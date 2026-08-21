/**
 * STUB — Assist / needsAssistance Terminal-UX (bewusst unverdrahtet).
 *
 * Fertig:
 * - Backend: `POST /checkins/assist/press|release`, pending-Liste
 * - Check-in setzt `needsAssistance`, wenn Press noch aktiv
 * - MFA: `TerminalAssistAlert` über Queue-Snapshot `assistPending`
 *
 * Offen (später verdrahten):
 * - Start: Assist-Press → `writeAssistMode` / API press
 * - Hints: `terminal.startAssistHint`, Topic-`topicAssistHint`, Subtitle `authMfaPressedSubtitle`
 * - optional Release + Expiry-UI
 *
 * Nicht verwechseln mit „Persönliche Anmeldung“ (`topicId: 'mfa'` → Visit `M-…`).
 */
export {
  pressTerminalAssist,
  releaseTerminalAssist,
  type TerminalAssistPressed,
} from './terminal-api';
export {
  clearAssistMode,
  readAssistExpiresAt,
  readAssistMode,
  writeAssistMode,
} from './terminal-session';
