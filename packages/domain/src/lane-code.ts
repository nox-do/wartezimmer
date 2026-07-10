/**
 * Reservierter Nummernkreis fuer den MFA-/Empfangs-Assist-Pfad.
 * Konfigurierbare Themen duerfen diesen Lane-Code nicht verwenden
 * (siehe docs/domain-model.md Invariante 5).
 */
export const MFA_ASSIST_LANE_CODE = 'M';

export const LANE_CODE_PATTERN = /^[A-Z]$/;

export function normalizeLaneCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidLaneCode(value: string): boolean {
  return LANE_CODE_PATTERN.test(normalizeLaneCode(value));
}

export function isReservedLaneCode(value: string): boolean {
  return normalizeLaneCode(value) === MFA_ASSIST_LANE_CODE;
}
