import type { DatabaseSync } from 'node:sqlite';
import type { Runtime } from '@praxis-flow/flow-core/server';
import { domainError } from '../errors/domain-error.js';
import type { OpsSettings } from '../db/db-types.js';
import { getVisitHostState, upsertVisitHostState } from '../db/visit-host-state.js';
import { mapFlowCoreTransitionError } from './visit-queue-bridge.js';
import { assertSupersedeAllowed } from '../queue/supersede-policy.js';

export type SupersedeVisitResult = {
  supersededVisitId: string;
  visitId: string;
  laneCode: string;
  number: number;
  topicId: string;
  topicLabel: string;
  destinationRoomLabel: string | null;
  checkedInAt: string;
  correlationId: string;
  documentsRebound: number;
};

/**
 * Documents may only move from a superseded visit to its successor.
 * Guard: `to.supersedes_visit_id === from` AND `from.superseded_by_visit_id === to`.
 */
export function rebindDocumentsForSupersede(
  db: DatabaseSync,
  fromVisitId: string,
  toVisitId: string,
): number {
  const from = fromVisitId.trim();
  const to = toVisitId.trim();
  if (!from || !to || from === to) {
    throw domainError('INVALID_ARGUMENT');
  }

  const link = db
    .prepare(
      `SELECT
         (SELECT superseded_by_visit_id FROM visits WHERE id = ?) AS fromSuccessor,
         (SELECT supersedes_visit_id FROM visits WHERE id = ?) AS toPredecessor`,
    )
    .get(from, to) as { fromSuccessor?: string | null; toPredecessor?: string | null } | undefined;

  if (!link || link.fromSuccessor !== to || link.toPredecessor !== from) {
    throw domainError('DOCUMENT_FORBIDDEN');
  }

  const result = db
    .prepare(
      `UPDATE documents
       SET visit_id = ?, updated_at = ?
       WHERE visit_id = ?`,
    )
    .run(to, new Date().toISOString(), from);
  return Number(result.changes ?? 0);
}

export function revokeActiveSessionsForVisit(db: DatabaseSync, visitId: string): void {
  db.prepare(
    "UPDATE patient_sessions SET status = 'revoked', updated_at = ? WHERE visit_id = ? AND status = 'active'",
  ).run(new Date().toISOString(), visitId);
}

export function supersedeVisitTopic(params: {
  db: DatabaseSync;
  runtime: Runtime;
  settings: OpsSettings;
  visitId: string;
  topicId: string;
}): SupersedeVisitResult {
  const { db, runtime, settings, visitId, topicId } = params;
  const activeVisit = runtime.visits().find((visit) => visit.id === visitId);
  if (!activeVisit) {
    throw domainError('VISIT_NOT_FOUND');
  }

  const hostState = getVisitHostState(db, visitId);
  const targetTopic = settings.topics.find((topic) => topic.topicId === topicId.trim());

  assertSupersedeAllowed({
    coreStatus: activeVisit.status,
    absentMode: hostState?.absentMode ?? null,
    sourceTopicId: activeVisit.primaryTopicId ?? '',
    targetTopicId: topicId,
    targetTopicEnabled: Boolean(targetTopic?.enabled),
  });

  let result;
  try {
    result = runtime.supersede(visitId, {
      topicId: topicId.trim(),
      preserveArrivedAt: true,
      surfaceId: activeVisit.lastSurfaceId,
      actorType: 'mfa',
    });
  } catch (error) {
    mapFlowCoreTransitionError(error);
  }

  const newVisit = result.visit;
  const oldHost = getVisitHostState(db, visitId);
  if (oldHost) {
    upsertVisitHostState(
      db,
      newVisit.id,
      {
        callbackPhone: oldHost.callbackPhone,
        checkinPhone: oldHost.checkinPhone,
        checkinLocale: oldHost.checkinLocale,
        identityRefOverride: oldHost.identityRefOverride,
        triageLevel: oldHost.triageLevel,
        absentMode: null,
        returnUntil: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
      },
      new Date().toISOString(),
    );
  }

  const documentsRebound = rebindDocumentsForSupersede(db, visitId, newVisit.id);
  revokeActiveSessionsForVisit(db, visitId);

  return {
    supersededVisitId: visitId,
    visitId: newVisit.id,
    laneCode: newVisit.queueLaneCode,
    number: newVisit.queueSequence,
    topicId: newVisit.primaryTopicId ?? topicId.trim(),
    topicLabel: newVisit.topic?.name ?? targetTopic?.label ?? topicId.trim(),
    destinationRoomLabel:
      newVisit.targetLocation?.publicName ?? newVisit.targetLocation?.name ?? null,
    checkedInAt: newVisit.checkedInAt ?? newVisit.createdAt,
    correlationId: result.correlationId,
    documentsRebound,
  };
}
