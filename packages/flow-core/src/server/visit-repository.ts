import type { DatabaseSync } from 'node:sqlite';
import type { Catalog, Visit, VisitEvent, VisitPatch, VisitView } from '@praxis-flow/flow-core';
import { journeyStepLabel, ACTIVE_VISIT_STATUSES } from '@praxis-flow/flow-core';
import type { CatalogRepository } from './catalog-repository.js';

type SqlRow = Record<string, unknown>;

function sqlIn(values: readonly string[]): string {
  return values.map(() => '?').join(', ');
}

const bool = (value: unknown) => Boolean(value);
const opt = <T>(value: T | null | undefined) => value ?? undefined;
const str = (value: unknown) => String(value);

const VISIT_SELECT_SQL = `SELECT visits.*, patients.display_name AS patient_display_name
FROM visits
JOIN patients ON patients.id = visits.patient_id
WHERE visits.id = ?`;

/** Check-in INSERT ohne Supersede-Link-Spalten — SQLite setzt NULL. */
const CHECKIN_VISIT_INSERT_SQL = `INSERT INTO visits (
  id, patient_id, status, primary_topic_id, applied_routing_rule_id,
  last_known_location_id, target_location_id, queue_id, last_surface_id,
  movement_mode, location_confidence, public_display_mode,
  queue_number, queue_number_date, queue_number_scope, queue_lane_code, queue_sequence,
  needs_assistance, check_in_path, auth_path,
  configured_escort_policy, effective_escort_policy, allow_redirect,
  terminal_instruction, staff_note,
  checked_in_at, called_at, arrived_at, started_at, finished_at,
  journey_template_id, journey_step_index, journey_step_completed_at, journey_state,
  created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export type CheckInPatientInsert = {
  id: string;
  displayName: string | null;
  isAnonymous: boolean;
  createdAt: string;
};

export type CheckInVisitInsert = {
  id: string;
  patientId: string;
  status: Visit['status'];
  primaryTopicId: string;
  appliedRoutingRuleId: string;
  lastKnownLocationId: string | null;
  targetLocationId: string | null;
  queueId: string | null;
  lastSurfaceId: string;
  movementMode: Visit['movementMode'];
  locationConfidence: Visit['locationConfidence'];
  publicDisplayMode: Visit['publicDisplayMode'];
  queueNumber: string;
  queueNumberDate: string;
  queueNumberScope: Visit['queueNumberScope'];
  queueLaneCode: string;
  queueSequence: number;
  needsAssistance: boolean;
  checkInPath: Visit['checkInPath'];
  authPath: Visit['authPath'];
  configuredEscortPolicy: Visit['configuredEscortPolicy'];
  effectiveEscortPolicy: Visit['effectiveEscortPolicy'];
  allowRedirect: boolean;
  terminalInstruction: string;
  staffNote: string | null;
  checkedInAt: string;
  journeyTemplateId: string | null;
  journeyStepIndex: number | null;
  journeyState: Visit['journeyState'] | null;
  createdAt: string;
  updatedAt: string;
};

export type CheckInTopicInsert = {
  id: string;
  visitId: string;
  topicId: string;
};

function mapVisit(row: SqlRow): Visit {
  return {
    id: str(row.id),
    patientId: str(row.patient_id),
    patientDisplayName: opt(row.patient_display_name as string | null),
    status: row.status as Visit['status'],
    primaryTopicId: opt(row.primary_topic_id as string | null),
    appliedRoutingRuleId: opt(row.applied_routing_rule_id as string | null),
    lastKnownLocationId: opt(row.last_known_location_id as string | null),
    targetLocationId: opt(row.target_location_id as string | null),
    queueId: opt(row.queue_id as string | null),
    lastSurfaceId: opt(row.last_surface_id as string | null),
    movementMode: row.movement_mode as Visit['movementMode'],
    locationConfidence: row.location_confidence as Visit['locationConfidence'],
    publicDisplayMode: row.public_display_mode as Visit['publicDisplayMode'],
    queueNumber: str(row.queue_number),
    queueNumberDate: str(row.queue_number_date),
    queueNumberScope: row.queue_number_scope as Visit['queueNumberScope'],
    queueLaneCode: str(row.queue_lane_code),
    queueSequence: Number(row.queue_sequence),
    needsAssistance: bool(row.needs_assistance),
    checkInPath: row.check_in_path as Visit['checkInPath'],
    authPath: row.auth_path as Visit['authPath'],
    configuredEscortPolicy: row.configured_escort_policy as Visit['configuredEscortPolicy'],
    effectiveEscortPolicy: row.effective_escort_policy as Visit['effectiveEscortPolicy'],
    allowRedirect: bool(row.allow_redirect),
    terminalInstruction: str(row.terminal_instruction),
    staffNote: opt(row.staff_note as string | null),
    checkedInAt: opt(row.checked_in_at as string | null),
    calledAt: opt(row.called_at as string | null),
    arrivedAt: opt(row.arrived_at as string | null),
    startedAt: opt(row.started_at as string | null),
    finishedAt: opt(row.finished_at as string | null),
    journeyTemplateId: opt(row.journey_template_id as string | null),
    journeyStepIndex: row.journey_step_index != null ? Number(row.journey_step_index) : undefined,
    journeyStepCompletedAt: opt(row.journey_step_completed_at as string | null),
    journeyState: opt(row.journey_state as Visit['journeyState'] | null),
    supersedesVisitId: opt(row.supersedes_visit_id as string | null),
    supersededByVisitId: opt(row.superseded_by_visit_id as string | null),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function mapEvent(row: SqlRow): VisitEvent {
  return {
    id: str(row.id),
    visitId: str(row.visit_id),
    sequence: Number(row.sequence),
    type: row.type as VisitEvent['type'],
    fromStatus: opt(row.from_status as string | null),
    toStatus: opt(row.to_status as string | null),
    fromLocationId: opt(row.from_location_id as string | null),
    toLocationId: opt(row.to_location_id as string | null),
    fromLocationName: opt(row.from_location_name as string | null),
    toLocationName: opt(row.to_location_name as string | null),
    fromQueueId: opt(row.from_queue_id as string | null),
    toQueueId: opt(row.to_queue_id as string | null),
    actorType: row.actor_type as VisitEvent['actorType'],
    actorId: opt(row.actor_id as string | null),
    note: opt(row.note as string | null),
    correlationId: opt(row.correlation_id as string | null),
    createdAt: str(row.created_at),
  };
}

export function visitRecordById(db: DatabaseSync, id: string): Visit | undefined {
  const row = db.prepare(VISIT_SELECT_SQL).get(id) as SqlRow | undefined;
  return row ? mapVisit(row) : undefined;
}

export function toVisitView(
  visitRow: Visit,
  catalog: Catalog,
  stepsForTemplateFn: CatalogRepository['stepsForTemplate'],
): VisitView {
  const steps = visitRow.journeyTemplateId
    ? stepsForTemplateFn(visitRow.journeyTemplateId, catalog.journeySteps)
    : [];
  return {
    ...visitRow,
    topic: catalog.topics.find((item) => item.id === visitRow.primaryTopicId),
    queue: catalog.queues.find((item) => item.id === visitRow.queueId),
    lastKnownLocation: catalog.locations.find((item) => item.id === visitRow.lastKnownLocationId),
    targetLocation: catalog.locations.find((item) => item.id === visitRow.targetLocationId),
    journeyTemplate: catalog.journeyTemplates.find(
      (item) => item.id === visitRow.journeyTemplateId,
    ),
    journeyStepLabel:
      visitRow.journeyStepIndex != null
        ? (journeyStepLabel(steps, visitRow.journeyStepIndex) ?? undefined)
        : undefined,
  };
}

export function insertCheckInAggregate(
  db: DatabaseSync,
  params: {
    patient: CheckInPatientInsert;
    visit: CheckInVisitInsert;
    topic: CheckInTopicInsert;
  },
): void {
  const { patient, visit: visitRow, topic } = params;
  db.prepare('INSERT INTO patients VALUES (?, ?, ?, ?)').run(
    patient.id,
    patient.displayName,
    patient.isAnonymous ? 0 : 1,
    patient.createdAt,
  );
  db.prepare(CHECKIN_VISIT_INSERT_SQL).run(
    visitRow.id,
    visitRow.patientId,
    visitRow.status,
    visitRow.primaryTopicId,
    visitRow.appliedRoutingRuleId,
    visitRow.lastKnownLocationId,
    visitRow.targetLocationId,
    visitRow.queueId,
    visitRow.lastSurfaceId,
    visitRow.movementMode,
    visitRow.locationConfidence,
    visitRow.publicDisplayMode,
    visitRow.queueNumber,
    visitRow.queueNumberDate,
    visitRow.queueNumberScope,
    visitRow.queueLaneCode,
    visitRow.queueSequence,
    visitRow.needsAssistance ? 1 : 0,
    visitRow.checkInPath,
    visitRow.authPath,
    visitRow.configuredEscortPolicy,
    visitRow.effectiveEscortPolicy,
    visitRow.allowRedirect ? 1 : 0,
    visitRow.terminalInstruction,
    visitRow.staffNote,
    visitRow.checkedInAt,
    null,
    null,
    null,
    null,
    visitRow.journeyTemplateId,
    visitRow.journeyStepIndex,
    null,
    visitRow.journeyState ?? null,
    visitRow.createdAt,
    visitRow.updatedAt,
  );
  db.prepare('INSERT INTO visit_topics VALUES (?, ?, ?, ?, ?)').run(
    topic.id,
    topic.visitId,
    topic.topicId,
    1,
    'open',
  );
}

function validateVisitPatch(patch: VisitPatch): void {
  for (const key of Object.keys(patch) as (keyof VisitPatch)[]) {
    if (patch[key] === undefined) {
      throw new Error('INVALID_VISIT_PATCH');
    }
  }
  if ('supersededByVisitId' in patch) {
    const supersededByVisitId = patch.supersededByVisitId;
    if (typeof supersededByVisitId !== 'string' || !supersededByVisitId.trim()) {
      throw new Error('INVALID_VISIT_PATCH');
    }
  }
}

function patchField(
  patch: VisitPatch,
  current: Visit,
  field: keyof VisitPatch,
): string | number | null | undefined {
  if (field in patch) {
    return patch[field] as string | number | null | undefined;
  }
  return current[field as keyof Visit] as string | number | null | undefined;
}

function sqlNullable(value: unknown): string | number | null {
  return value == null ? null : (value as string | number);
}

export function updateVisit(db: DatabaseSync, current: Visit, patch: VisitPatch): void {
  validateVisitPatch(patch);
  const sets = [
    'status = ?',
    'last_known_location_id = ?',
    'target_location_id = ?',
    'queue_id = ?',
    'movement_mode = ?',
    'location_confidence = ?',
    'public_display_mode = ?',
    'staff_note = ?',
    'terminal_instruction = ?',
    'called_at = ?',
    'arrived_at = ?',
    'started_at = ?',
    'finished_at = ?',
    'journey_step_index = ?',
    'journey_step_completed_at = ?',
    'journey_state = ?',
  ];
  const values: Array<string | number | null> = [
    patchField(patch, current, 'status') as Visit['status'],
    sqlNullable(patchField(patch, current, 'lastKnownLocationId')),
    sqlNullable(patchField(patch, current, 'targetLocationId')),
    sqlNullable(patchField(patch, current, 'queueId')),
    patchField(patch, current, 'movementMode') as Visit['movementMode'],
    patchField(patch, current, 'locationConfidence') as Visit['locationConfidence'],
    patchField(patch, current, 'publicDisplayMode') as Visit['publicDisplayMode'],
    sqlNullable(patchField(patch, current, 'staffNote')),
    patchField(patch, current, 'terminalInstruction') as string,
    sqlNullable(patchField(patch, current, 'calledAt')),
    sqlNullable(patchField(patch, current, 'arrivedAt')),
    sqlNullable(patchField(patch, current, 'startedAt')),
    sqlNullable(patchField(patch, current, 'finishedAt')),
    sqlNullable(patchField(patch, current, 'journeyStepIndex')),
    sqlNullable(patchField(patch, current, 'journeyStepCompletedAt')),
    sqlNullable(patchField(patch, current, 'journeyState')),
  ];

  if ('supersededByVisitId' in patch) {
    const supersededByVisitId = patch.supersededByVisitId;
    if (supersededByVisitId === undefined) throw new Error('INVALID_VISIT_PATCH');
    sets.push('superseded_by_visit_id = ?');
    values.push(supersededByVisitId);
  }

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(current.id);

  db.prepare(`UPDATE visits SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function addEvent(
  db: DatabaseSync,
  visitId: string,
  type: VisitEvent['type'],
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
  fromLocationId: string | null | undefined,
  toLocationId: string | null | undefined,
  fromQueueId: string | null | undefined,
  toQueueId: string | null | undefined,
  actorType: VisitEvent['actorType'],
  note: string | null = null,
  eventOptions: { correlationId?: string; actorId?: string } = {},
): void {
  const { correlationId, actorId } = eventOptions;
  const sequence = Number(
    (
      db
        .prepare(
          'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM visit_events WHERE visit_id = ?',
        )
        .get(visitId) as { next: number }
    ).next,
  );
  const locationName = (locationId: string | null | undefined): string | null => {
    if (!locationId) return null;
    const row = db.prepare('SELECT name FROM locations WHERE id = ?').get(locationId) as
      | { name: string }
      | undefined;
    return row?.name ?? null;
  };
  db.prepare(
    `INSERT INTO visit_events (
      id, visit_id, sequence, type, from_status, to_status,
      from_location_id, to_location_id, from_location_name, to_location_name,
      from_queue_id, to_queue_id, actor_type, actor_id, note, correlation_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    visitId,
    sequence,
    type,
    fromStatus ?? null,
    toStatus ?? null,
    fromLocationId ?? null,
    toLocationId ?? null,
    locationName(fromLocationId),
    locationName(toLocationId),
    fromQueueId ?? null,
    toQueueId ?? null,
    actorType,
    actorId ?? null,
    note,
    correlationId ?? null,
    new Date().toISOString(),
  );
}

export function createVisitRepository(db: DatabaseSync, catalogRepository: CatalogRepository) {
  const visitById = (id: string): VisitView | undefined => {
    const record = visitRecordById(db, id);
    return record
      ? toVisitView(record, catalogRepository.loadCatalog(), catalogRepository.stepsForTemplate)
      : undefined;
  };

  const visits = (): VisitView[] => {
    const activeStatuses = [...ACTIVE_VISIT_STATUSES];
    const rows = db
      .prepare(
        `SELECT visits.*, patients.display_name AS patient_display_name
       FROM visits
       JOIN patients ON patients.id = visits.patient_id
       WHERE visits.status IN (${sqlIn(activeStatuses)})
       ORDER BY visits.created_at`,
      )
      .all(...activeStatuses) as SqlRow[];
    const catalog = catalogRepository.loadCatalog();
    return rows.map((row) =>
      toVisitView(mapVisit(row), catalog, catalogRepository.stepsForTemplate),
    );
  };

  const events = (visitId: string): VisitEvent[] =>
    (
      db
        .prepare('SELECT * FROM visit_events WHERE visit_id = ? ORDER BY sequence')
        .all(visitId) as SqlRow[]
    ).map(mapEvent);

  return {
    visits,
    visitById,
    visitRecordById: (id: string) => visitRecordById(db, id),
    toVisitView: (visitRow: Visit, catalog: Catalog) =>
      toVisitView(visitRow, catalog, catalogRepository.stepsForTemplate),
    insertCheckInAggregate: (params: {
      patient: CheckInPatientInsert;
      visit: CheckInVisitInsert;
      topic: CheckInTopicInsert;
    }) => insertCheckInAggregate(db, params),
    events,
    updateVisit: (current: Visit, patch: VisitPatch) => updateVisit(db, current, patch),
    addEvent: (
      visitId: string,
      type: VisitEvent['type'],
      fromStatus: string | null | undefined,
      toStatus: string | null | undefined,
      fromLocationId: string | null | undefined,
      toLocationId: string | null | undefined,
      fromQueueId: string | null | undefined,
      toQueueId: string | null | undefined,
      actorType: VisitEvent['actorType'],
      note?: string | null,
      eventOptions?: { correlationId?: string; actorId?: string },
    ) =>
      addEvent(
        db,
        visitId,
        type,
        fromStatus,
        toStatus,
        fromLocationId,
        toLocationId,
        fromQueueId,
        toQueueId,
        actorType,
        note ?? null,
        eventOptions,
      ),
  };
}

export type VisitRepository = ReturnType<typeof createVisitRepository>;
