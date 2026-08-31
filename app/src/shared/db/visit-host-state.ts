import type { DatabaseSync } from 'node:sqlite';
import type { Runtime } from '@praxis-flow/flow-core/server';
import type { VisitStatus } from '@praxis-flow/flow-core';
import type { AbsenceMode, QueueSummary, QueueDisplayStatus } from './db-types.js';
import { canonicalizePhone } from '../phone/canonicalize-phone.js';
import { domainError } from '../errors/domain-error.js';
import { cycleTriageLevel, type TriageLevel } from '../queue/queue-triage.js';
import { resolveRecallNotifyPhone } from '../queue/recall-notify-phone.js';

export type VisitHostStateRow = {
  visitId: string;
  absentMode: AbsenceMode | null;
  callbackPhone: string | null;
  returnUntil: string | null;
  recallNotifyErrorCode: string | null;
  recallNotifySent: boolean;
  triageLevel: string | null;
  checkinPhone: string | null;
  checkinLocale: string | null;
  identityRefOverride: string | null;
  updatedAt: string;
};

const VISIT_QUEUE_STATUSES = new Set<VisitStatus>([
  'waiting',
  'directed',
  'called',
  'arrived',
  'in_progress',
  'blocked',
]);

const PENDING_DOCUMENT_STATUSES = ['scan_clean', 'preview_requested', 'export_requested'] as const;

export function ensureVisitHostStateSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS visit_host_state (
      visit_id TEXT PRIMARY KEY,
      absent_mode TEXT CHECK (absent_mode IS NULL OR absent_mode IN ('wait_here', 'return_later')),
      callback_phone TEXT,
      return_until TEXT,
      recall_notify_error_code TEXT,
      recall_notify_sent INTEGER NOT NULL DEFAULT 0,
      triage_level TEXT,
      checkin_phone TEXT,
      checkin_locale TEXT,
      identity_ref_override TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
    );
  `);
}

function mapHostStateRow(row: Record<string, unknown> | undefined): VisitHostStateRow | null {
  if (!row?.visitId || typeof row.updatedAt !== 'string') {
    return null;
  }
  return {
    visitId: String(row.visitId),
    absentMode: (row.absentMode as AbsenceMode | null) ?? null,
    callbackPhone: (row.callbackPhone as string | null) ?? null,
    returnUntil: (row.returnUntil as string | null) ?? null,
    recallNotifyErrorCode: (row.recallNotifyErrorCode as string | null) ?? null,
    recallNotifySent: Boolean(row.recallNotifySent),
    triageLevel: (row.triageLevel as string | null) ?? null,
    checkinPhone: (row.checkinPhone as string | null) ?? null,
    checkinLocale: (row.checkinLocale as string | null) ?? null,
    identityRefOverride: (row.identityRefOverride as string | null) ?? null,
    updatedAt: row.updatedAt,
  };
}

export function absentModeToQueueDisplayStatus(absentMode: AbsenceMode): QueueDisplayStatus {
  return absentMode === 'wait_here' ? 'absent_wait_here' : 'absent_return_later';
}

export function getVisitHostState(db: DatabaseSync, visitId: string): VisitHostStateRow | null {
  const row = db
    .prepare(
      `SELECT
        visit_id AS visitId,
        absent_mode AS absentMode,
        callback_phone AS callbackPhone,
        return_until AS returnUntil,
        recall_notify_error_code AS recallNotifyErrorCode,
        recall_notify_sent AS recallNotifySent,
        triage_level AS triageLevel,
        checkin_phone AS checkinPhone,
        checkin_locale AS checkinLocale,
        identity_ref_override AS identityRefOverride,
        updated_at AS updatedAt
      FROM visit_host_state
      WHERE visit_id = ?
      LIMIT 1`,
    )
    .get(visitId) as Record<string, unknown> | undefined;
  return mapHostStateRow(row);
}

export function upsertVisitHostState(
  db: DatabaseSync,
  visitId: string,
  patch: Partial<
    Omit<VisitHostStateRow, 'visitId' | 'updatedAt' | 'recallNotifySent'> & {
      recallNotifySent?: boolean;
    }
  >,
  updatedAt: string,
): void {
  const existing = getVisitHostState(db, visitId);
  const merged: VisitHostStateRow = {
    visitId,
    absentMode: patch.absentMode !== undefined ? patch.absentMode : (existing?.absentMode ?? null),
    callbackPhone:
      patch.callbackPhone !== undefined ? patch.callbackPhone : (existing?.callbackPhone ?? null),
    returnUntil:
      patch.returnUntil !== undefined ? patch.returnUntil : (existing?.returnUntil ?? null),
    recallNotifyErrorCode:
      patch.recallNotifyErrorCode !== undefined
        ? patch.recallNotifyErrorCode
        : (existing?.recallNotifyErrorCode ?? null),
    recallNotifySent:
      patch.recallNotifySent !== undefined
        ? patch.recallNotifySent
        : (existing?.recallNotifySent ?? false),
    triageLevel:
      patch.triageLevel !== undefined ? patch.triageLevel : (existing?.triageLevel ?? null),
    checkinPhone:
      patch.checkinPhone !== undefined ? patch.checkinPhone : (existing?.checkinPhone ?? null),
    checkinLocale:
      patch.checkinLocale !== undefined ? patch.checkinLocale : (existing?.checkinLocale ?? null),
    identityRefOverride:
      patch.identityRefOverride !== undefined
        ? patch.identityRefOverride
        : (existing?.identityRefOverride ?? null),
    updatedAt,
  };

  db.prepare(
    `INSERT INTO visit_host_state (
      visit_id, absent_mode, callback_phone, return_until,
      recall_notify_error_code, recall_notify_sent, triage_level,
      checkin_phone, checkin_locale, identity_ref_override, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(visit_id) DO UPDATE SET
      absent_mode = excluded.absent_mode,
      callback_phone = excluded.callback_phone,
      return_until = excluded.return_until,
      recall_notify_error_code = excluded.recall_notify_error_code,
      recall_notify_sent = excluded.recall_notify_sent,
      triage_level = excluded.triage_level,
      checkin_phone = excluded.checkin_phone,
      checkin_locale = excluded.checkin_locale,
      identity_ref_override = excluded.identity_ref_override,
      updated_at = excluded.updated_at`,
  ).run(
    merged.visitId,
    merged.absentMode,
    merged.callbackPhone,
    merged.returnUntil,
    merged.recallNotifyErrorCode,
    merged.recallNotifySent ? 1 : 0,
    merged.triageLevel,
    merged.checkinPhone,
    merged.checkinLocale,
    merged.identityRefOverride,
    merged.updatedAt,
  );
}

export function clearAbsentMode(db: DatabaseSync, visitId: string, updatedAt: string): void {
  const existing = getVisitHostState(db, visitId);
  if (!existing) {
    return;
  }
  upsertVisitHostState(
    db,
    visitId,
    {
      absentMode: null,
      returnUntil: null,
      callbackPhone: null,
    },
    updatedAt,
  );
}

export function setVisitCallbackPhone(
  db: DatabaseSync,
  visitId: string,
  callbackPhone: string,
  updatedAt: string,
): string {
  const canonical = canonicalizePhone(callbackPhone);
  if (!canonical) {
    throw domainError('INVALID_ARGUMENT');
  }
  upsertVisitHostState(db, visitId, { callbackPhone: canonical }, updatedAt);
  return canonical;
}

export function clearVisitCallbackPhone(
  db: DatabaseSync,
  visitId: string,
  updatedAt: string,
): void {
  upsertVisitHostState(db, visitId, { callbackPhone: null }, updatedAt);
}

export function setVisitTriageLevel(
  db: DatabaseSync,
  visitId: string,
  triageLevel: TriageLevel | null,
  updatedAt: string,
): TriageLevel | null {
  upsertVisitHostState(db, visitId, { triageLevel }, updatedAt);
  return triageLevel;
}

export function setVisitIdentityRefOverride(
  db: DatabaseSync,
  visitId: string,
  identityRefOverride: string,
  updatedAt: string,
): string {
  const trimmed = identityRefOverride.trim();
  if (!trimmed || trimmed.length > 160) {
    throw domainError('INVALID_ARGUMENT');
  }
  upsertVisitHostState(db, visitId, { identityRefOverride: trimmed }, updatedAt);
  return trimmed;
}

export function setVisitAbsentMode(
  db: DatabaseSync,
  visitId: string,
  mode: AbsenceMode,
  updatedAt: string,
): void {
  upsertVisitHostState(db, visitId, { absentMode: mode }, updatedAt);
}

export function clearVisitRecallNotifyState(
  db: DatabaseSync,
  visitId: string,
  updatedAt: string,
): void {
  upsertVisitHostState(
    db,
    visitId,
    { recallNotifyErrorCode: null, recallNotifySent: false },
    updatedAt,
  );
}

export function applyVisitRecall(
  db: DatabaseSync,
  visitId: string,
  returnUntil: string,
  updatedAt: string,
): void {
  clearVisitRecallNotifyState(db, visitId, updatedAt);
  // Keep callbackPhone for the return window so retry / fix-notify can reuse the MFA number.
  // clearAbsentMode nulls it when leaving return_later.
  upsertVisitHostState(
    db,
    visitId,
    {
      absentMode: 'return_later',
      returnUntil,
    },
    updatedAt,
  );
}

export function setRecallNotifyError(
  db: DatabaseSync,
  visitId: string,
  errorCode: string | null,
  updatedAt: string,
): void {
  upsertVisitHostState(db, visitId, { recallNotifyErrorCode: errorCode }, updatedAt);
}

export function setRecallNotifySent(
  db: DatabaseSync,
  visitId: string,
  sent: boolean,
  updatedAt: string,
): void {
  upsertVisitHostState(db, visitId, { recallNotifySent: sent }, updatedAt);
}

export function listVisitHostStatesForBusinessDay(
  db: DatabaseSync,
  businessDay: string,
): Map<string, VisitHostStateRow> {
  const rows = db
    .prepare(
      `SELECT
        h.visit_id AS visitId,
        h.absent_mode AS absentMode,
        h.callback_phone AS callbackPhone,
        h.return_until AS returnUntil,
        h.recall_notify_error_code AS recallNotifyErrorCode,
        h.recall_notify_sent AS recallNotifySent,
        h.triage_level AS triageLevel,
        h.checkin_phone AS checkinPhone,
        h.checkin_locale AS checkinLocale,
        h.identity_ref_override AS identityRefOverride,
        h.updated_at AS updatedAt
      FROM visit_host_state h
      JOIN visits v ON v.id = h.visit_id
      WHERE v.queue_number_date = ?`,
    )
    .all(businessDay) as Array<Record<string, unknown>>;

  const map = new Map<string, VisitHostStateRow>();
  for (const row of rows) {
    const mapped = mapHostStateRow(row);
    if (mapped) {
      map.set(mapped.visitId, mapped);
    }
  }
  return map;
}

/** Pending document count by visit_id (Phase B2 portal FK). */
export function countPendingDocumentsByVisitIds(
  db: DatabaseSync,
  visitIds: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  if (visitIds.length === 0) {
    return counts;
  }

  const documentsTable = db
    .prepare(
      "SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = 'documents' LIMIT 1",
    )
    .get() as { exists_flag?: number } | undefined;
  if (documentsTable?.exists_flag !== 1) {
    return counts;
  }

  const hasVisitIdColumn = db
    .prepare('PRAGMA table_info(documents)')
    .all()
    .some((row) => (row as { name?: string }).name === 'visit_id');
  if (!hasVisitIdColumn) {
    return counts;
  }

  const placeholders = visitIds.map(() => '?').join(', ');
  const statusPlaceholders = PENDING_DOCUMENT_STATUSES.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT visit_id AS visitId, COUNT(1) AS pendingCount
      FROM documents
      WHERE visit_id IN (${placeholders})
        AND status IN (${statusPlaceholders})
      GROUP BY visit_id`,
    )
    .all(...visitIds, ...PENDING_DOCUMENT_STATUSES) as Array<{
    visitId?: string;
    pendingCount?: number;
  }>;

  for (const row of rows) {
    if (row.visitId) {
      counts.set(row.visitId, row.pendingCount ?? 0);
    }
  }
  return counts;
}

export function countVisitQueueSummary(
  runtime: Runtime,
  db: DatabaseSync,
  businessDay: string,
): QueueSummary {
  const hostStates = listVisitHostStatesForBusinessDay(db, businessDay);
  const summary: QueueSummary = {
    waitingNow: 0,
    calledNow: 0,
    inRoomNow: 0,
    absentNow: 0,
    processedToday: 0,
  };

  for (const visit of runtime.visits()) {
    if (visit.queueNumberDate !== businessDay) {
      continue;
    }
    if (visit.status === 'done') {
      summary.processedToday += 1;
      continue;
    }
    if (!VISIT_QUEUE_STATUSES.has(visit.status)) {
      continue;
    }

    const hostState = hostStates.get(visit.id);
    if (hostState?.absentMode) {
      summary.absentNow += 1;
      continue;
    }

    if (visit.status === 'called') {
      summary.calledNow += 1;
    } else if (visit.status === 'arrived' || visit.status === 'in_progress') {
      summary.inRoomNow += 1;
    } else {
      summary.waitingNow += 1;
    }
  }

  return summary;
}

function isRecallWindowExpired(returnUntil: string, nowIso: string): boolean {
  const nowMs = Date.parse(nowIso);
  const deadlineMs = Date.parse(returnUntil);
  if (Number.isNaN(nowMs) || Number.isNaN(deadlineMs)) {
    return false;
  }
  return deadlineMs <= nowMs;
}

export function listExpiredVisitRecallWindows(
  db: DatabaseSync,
  businessDay: string,
  nowIso: string,
): string[] {
  const rows = db
    .prepare(
      `SELECT v.id AS visitId
      FROM visits v
      JOIN visit_host_state h ON h.visit_id = v.id
      WHERE v.queue_number_date = ?
        AND h.absent_mode = 'return_later'
        AND h.return_until IS NOT NULL
        AND h.return_until <= ?`,
    )
    .all(businessDay, nowIso) as Array<{ visitId?: string }>;

  return rows.map((row) => row.visitId?.trim()).filter((id): id is string => Boolean(id));
}

export function readVisitRecallNotifyRetryContext(
  db: DatabaseSync,
  visitId: string,
  nowIso: string,
): {
  returnUntil: string;
  returnWindowMinutes: number;
  callbackPhone: string;
  checkinLocale: string | null;
} {
  const hostState = getVisitHostState(db, visitId);
  if (!hostState || hostState.absentMode !== 'return_later') {
    throw domainError('INVALID_TRANSITION');
  }
  if (!hostState.recallNotifyErrorCode?.trim()) {
    throw domainError('RECALL_NOTIFY_RETRY_NOT_ALLOWED');
  }
  const returnUntil = hostState.returnUntil?.trim() ?? '';
  if (!returnUntil) {
    throw domainError('INVALID_TRANSITION');
  }

  const deadlineMs = Date.parse(returnUntil);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(deadlineMs) || Number.isNaN(nowMs)) {
    throw domainError('INVALID_TRANSITION');
  }
  if (deadlineMs <= nowMs) {
    throw domainError('RECALL_WINDOW_EXPIRED');
  }

  const notifyPhone = resolveRecallNotifyPhone(hostState.callbackPhone, hostState.checkinPhone);
  if (notifyPhone == null) {
    throw domainError('MISSING_CALLBACK_PHONE');
  }

  const remainingMs = deadlineMs - nowMs;
  const returnWindowMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  return {
    returnUntil,
    returnWindowMinutes,
    callbackPhone: notifyPhone,
    checkinLocale: hostState.checkinLocale?.trim() || null,
  };
}

export function cycleVisitTriage(
  db: DatabaseSync,
  visitId: string,
  currentTriageLevel: string | null | undefined,
  updatedAt: string,
): TriageLevel | null {
  const triageLevel = cycleTriageLevel(currentTriageLevel);
  return setVisitTriageLevel(db, visitId, triageLevel, updatedAt);
}

export function isVisitRecallWindowExpired(hostState: VisitHostStateRow, nowIso: string): boolean {
  if (hostState.absentMode !== 'return_later' || !hostState.returnUntil?.trim()) {
    return false;
  }
  return isRecallWindowExpired(hostState.returnUntil, nowIso);
}
