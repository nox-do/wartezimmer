/**
 * UI types derived from openapi/queue.yaml (generated via `npm run generate:openapi-types`).
 * Fastify handlers use app/src/api/generated/queue.fastify-schemas.ts — keep in sync via npm run generate:api.
 */
import type { components } from '$lib/queue/generated/queue-openapi';

type QueueSchemas = components['schemas'];

export type QueueStatus = QueueSchemas['QueueStatus'];
export type QueueItem = QueueSchemas['QueueItem'];
export type QueueResponse = QueueSchemas['QueueListMfaResponse'];
export type TvQueueItem = QueueSchemas['QueueTvItem'];
export type TvQueueResponse = QueueSchemas['QueueListTvResponse'];
export type RoomPanelItem = QueueSchemas['RoomPanelItem'];
export type RoomPanelCallCandidate = QueueSchemas['RoomPanelCallCandidate'];
export type RoomPanelSnapshot = QueueSchemas['RoomPanelSnapshot'];
export type QueueTransitionResponse = QueueSchemas['QueueTransitionResponse'];
export type QueueVisitTransitionBody = QueueSchemas['QueueVisitTransitionRequest'];
export type QueueVisitTransitionResponse = QueueSchemas['QueueVisitTransitionResponse'];
export type QueueRecallResponse = QueueSchemas['QueueRecallResponse'];
export type QueueRecallRetryNotifyResponse = QueueSchemas['QueueRecallRetryNotifyResponse'];
export type QueueCallbackPhoneResponse = QueueSchemas['QueueCallbackPhoneResponse'];
export type QueueCallbackPhoneClearResponse = QueueSchemas['QueueCallbackPhoneClearResponse'];
export type QueueIdentityRefResponse = QueueSchemas['QueueIdentityRefResponse'];
export type QueueSupersedeResponse = QueueSchemas['QueueSupersedeResponse'];
export type QueueTriageResponse = QueueSchemas['QueueTriageResponse'];
export type TriageLevel = NonNullable<QueueItem['triageLevel']>;
export type QueueSummaryResponse = QueueSchemas['QueueSummaryResponse'];
export type AbsenceMode = QueueSchemas['AbsenceMode'];

