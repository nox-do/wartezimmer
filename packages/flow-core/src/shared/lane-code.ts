import { MFA_ASSIST_TOPIC_ID } from './check-in-path.js';

/** PoC-Seed: reservierter Nummernkreis fuer Hilfe-Check-in — Host ohne System-Topic. */
export const MFA_ASSIST_LANE_CODE = 'M';

export function normalizeLaneCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidLaneCode(value: string): boolean {
  return /^[A-Z]$/.test(normalizeLaneCode(value));
}

export function isReservedLaneCode(value: string): boolean {
  return normalizeLaneCode(value) === MFA_ASSIST_LANE_CODE;
}

export function laneCounterScope(laneCode: string): string {
  return `lane:${normalizeLaneCode(laneCode)}`;
}

export function resolveLaneCodeForCheckIn(topic: { laneCode: string }): string {
  if (!topic?.laneCode || !isValidLaneCode(topic.laneCode)) {
    throw new Error('INVALID_LANE_CODE');
  }
  return normalizeLaneCode(topic.laneCode);
}

export function assertTopicLaneCode(topic: { id: string; laneCode: string; active?: boolean }): void {
  if (!isValidLaneCode(topic.laneCode)) throw new Error('INVALID_LANE_CODE');
  if (topic.id !== MFA_ASSIST_TOPIC_ID && isReservedLaneCode(topic.laneCode)) {
    throw new Error('RESERVED_LANE_CODE');
  }
}
