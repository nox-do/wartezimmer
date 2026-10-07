import {
  isReservedLaneCode,
  isValidLaneCode,
  MFA_ASSIST_LANE_CODE,
  normalizeLaneCode,
} from '@wartezimmer/domain';
import { MFA_ASSIST_TOPIC_ID } from './check-in-path.js';

export { isReservedLaneCode, isValidLaneCode, MFA_ASSIST_LANE_CODE, normalizeLaneCode };

export function laneCounterScope(laneCode: string): string {
  return `lane:${normalizeLaneCode(laneCode)}`;
}

export function resolveLaneCodeForCheckIn(topic: { laneCode: string }): string {
  if (!topic?.laneCode || !isValidLaneCode(topic.laneCode)) {
    throw new Error('INVALID_LANE_CODE');
  }
  return normalizeLaneCode(topic.laneCode);
}

export function assertTopicLaneCode(topic: {
  id: string;
  laneCode: string;
  active?: boolean;
}): void {
  if (!isValidLaneCode(topic.laneCode)) throw new Error('INVALID_LANE_CODE');
  if (topic.id !== MFA_ASSIST_TOPIC_ID && isReservedLaneCode(topic.laneCode)) {
    throw new Error('RESERVED_LANE_CODE');
  }
}
