import type { DatabaseSync } from 'node:sqlite';
import type { AuthPath } from '@praxis-flow/flow-core';
import type { CreateTicketCallerInput, QueueDisplayStatus } from '../db/db-types.js';
import type { CheckinSessionDeps } from '../db/database-checkin-sessions.js';
import { assertCheckInAllowed } from '../db/database-checkin-sessions.js';
import { upsertVisitHostState } from '../db/visit-host-state.js';
import { canonicalizePhone } from '../phone/canonicalize-phone.js';
import {
  MFA_ASSIST_TOPIC_ID,
  resolveTopicLabelFromSettings,
  resolveCheckInDestinationRoomLabel,
} from '../checkin-topic-settings.js';
import { PF_FLOW_SURFACE_TERMINAL } from './catalog-ids.js';
import { getFlowCoreRuntime } from './flow-core-runtime.js';
import { visitStatusToQueueDisplayStatus } from './visit-queue-bridge.js';

export function createVisitCheckInInDb(
  deps: CheckinSessionDeps & { db: DatabaseSync },
  input: CreateTicketCallerInput,
): {
  visitId: string;
  number: number;
  queueStatus: QueueDisplayStatus;
  createdAt: string;
  destinationRoomLabel: string | null;
} {
  assertCheckInAllowed(deps, input.topicId);

  const settings = deps.getOpsSettings();
  const runtime = getFlowCoreRuntime(deps.db);

  const isMfaAssist = input.topicId === MFA_ASSIST_TOPIC_ID && input.needsAssistance === true;
  const commonCheckIn = {
    authPath: input.authPath as AuthPath,
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
    displayName: input.identityRef?.trim() || undefined,
  };
  const visit = runtime.checkIn(
    isMfaAssist
      ? { ...commonCheckIn, mfaAssist: true }
      : {
          ...commonCheckIn,
          topicId: input.topicId,
          needsAssistance: input.needsAssistance === true,
        },
  );
  if (!visit) {
    throw new Error('CHECKIN_FAILED');
  }

  const topicLabel = visit.topic?.name ?? resolveTopicLabelFromSettings(settings, input.topicId);
  const createdAt = visit.checkedInAt ?? visit.createdAt;
  const destinationRoomLabel = resolveCheckInDestinationRoomLabel(visit.targetLocation);

  const checkinPhone = input.checkinPhone?.trim()
    ? canonicalizePhone(input.checkinPhone.trim())
    : null;
  upsertVisitHostState(
    deps.db,
    visit.id,
    {
      checkinPhone,
      checkinLocale: input.checkinLocale ?? null,
    },
    createdAt,
  );

  deps.emitOutboxEvent('CheckinCreated', visit.id, {
    visitId: visit.id,
    topicId: input.topicId,
    topicLabel,
    authPath: input.authPath,
    laneCode: visit.queueLaneCode,
    number: visit.queueSequence,
    createdAt,
  });

  return {
    visitId: visit.id,
    number: visit.queueSequence,
    queueStatus: visitStatusToQueueDisplayStatus(visit.status),
    createdAt,
    destinationRoomLabel,
  };
}
