/**
 * Backend handler types derived from openapi/queue.yaml.
 */
import type { components, paths } from './generated/queue-openapi.js';

export type QueueSummaryResponse = components['schemas']['QueueSummaryResponse'];
export type QueueTransitionResponse = components['schemas']['QueueTransitionResponse'];
export type QueueTriageResponse = components['schemas']['QueueTriageResponse'];
export type QueueRecallResponse = components['schemas']['QueueRecallResponse'];
export type QueueVisitTransitionBody = components['schemas']['QueueVisitTransitionRequest'];
export type QueueVisitTransitionResponse = components['schemas']['QueueVisitTransitionResponse'];
export type QueueRoomActionBody = components['schemas']['QueueRoomActionBody'];
export type AbsenceMode = components['schemas']['AbsenceMode'];
export type MarkAbsenceLookupBody = components['schemas']['MarkAbsenceLookupRequest'];
export type VisitParams = paths['/api/v1/queue/{visitId}/transition']['post']['parameters']['path'];
export type SetCallbackPhoneBody = NonNullable<
  paths['/api/v1/queue/{visitId}/callback-phone']['put']['requestBody']
>['content']['application/json'];
export type SetIdentityRefBody = NonNullable<
  paths['/api/v1/queue/{visitId}/identity-ref']['patch']['requestBody']
>['content']['application/json'];
export type QueueCallbackPhoneResponse = components['schemas']['QueueCallbackPhoneResponse'];
export type QueueCallbackPhoneClearResponse =
  components['schemas']['QueueCallbackPhoneClearResponse'];
export type QueueIdentityRefResponse = components['schemas']['QueueIdentityRefResponse'];
export type QueueRecallRetryNotifyResponse =
  components['schemas']['QueueRecallRetryNotifyResponse'];
