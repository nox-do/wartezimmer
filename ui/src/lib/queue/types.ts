export type {
  AbsenceMode,
  QueueItem,
  QueueRecallResponse,
  QueueResponse,
  QueueStatus,
  QueueSummaryResponse,
  QueueTransitionResponse,
  RoomPanelItem,
  RoomPanelSnapshot,
  TvQueueItem,
  TvQueueResponse,
} from './openapi-types';

/** UI-only partition key for MFA wait board — not part of API contract. */
export type QueueZone = 'active' | 'away' | 'waiting';
