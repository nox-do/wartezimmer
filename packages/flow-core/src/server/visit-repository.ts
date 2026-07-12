import type { DatabaseSync } from 'node:sqlite';
import type { Catalog, Visit, VisitEvent, VisitView } from '@praxis-flow/flow-core';
import { journeyStepLabel, ACTIVE_VISIT_STATUSES } from '@praxis-flow/flow-core';
import type { CatalogRepository } from './catalog-repository.js';

type SqlRow = Record<string, unknown>;

function sqlIn(values: readonly string[]): string {
  return values.map(() => '?').join(', ');
}

const bool = (value: unknown) => Boolean(value);
const opt = <T>(value: T | null | undefined) => value ?? undefined;
const str = (value: unknown) => String(value);

function visit(row: SqlRow): Visit {
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

function event(row: SqlRow): VisitEvent {
  return {
    id: str(row.id),
    visitId: str(row.visit_id),
    type: row.type as VisitEvent['type'],
    fromStatus: opt(row.from_status as string | null),
    toStatus: opt(row.to_status as string | null),
    fromLocationId: opt(row.from_location_id as string | null),
    toLocationId: opt(row.to_location_id as string | null),
    fromQueueId: opt(row.from_queue_id as string | null),
    toQueueId: opt(row.to_queue_id as string | null),
    actorType: row.actor_type as VisitEvent['actorType'],
    actorId: opt(row.actor_id as string | null),
    note: opt(row.note as string | null),
    correlationId: opt(row.correlation_id as string | null),
    createdAt: str(row.created_at),
  };
}

function patchField<K extends keyof Visit>(
  patch: Partial<Visit>,
  current: Visit,
  field: K,
): Visit[K] | null | undefined {
  return field in patch ? patch[field] : current[field];
}

export function updateVisit(db: DatabaseSync, current: Visit, patch: Partial<Visit>): void {
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
    'journey_template_id = ?',
    'journey_step_index = ?',
    'journey_step_completed_at = ?',
    'journey_state = ?',
  ];
  const values: Array<string | number | null> = [
    patch.status ?? current.status,
    patchField(patch, current, 'lastKnownLocationId') ?? null,
    patchField(patch, current, 'targetLocationId') ?? null,
    patchField(patch, current, 'queueId') ?? null,
    patch.movementMode ?? current.movementMode,
    patch.locationConfidence ?? current.locationConfidence,
    patch.publicDisplayMode ?? current.publicDisplayMode,
    patch.staffNote ?? current.staffNote ?? null,
    patch.terminalInstruction ?? current.terminalInstruction,
    patchField(patch, current, 'calledAt') ?? null,
    patchField(patch, current, 'arrivedAt') ?? null,
    patchField(patch, current, 'startedAt') ?? null,
    patchField(patch, current, 'finishedAt') ?? null,
    patch.journeyTemplateId ?? current.journeyTemplateId ?? null,
    patchField(patch, current, 'journeyStepIndex') ?? null,
    patchField(patch, current, 'journeyStepCompletedAt') ?? null,
    patchField(patch, current, 'journeyState') ?? null,
  ];

  if ('supersededByVisitId' in patch) {
    sets.push('superseded_by_visit_id = ?');
    values.push(patch.supersededByVisitId ?? null);
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
  eventOptions: { correlationId?: string } = {},
): void {
  const { correlationId } = eventOptions;
  db.prepare('INSERT INTO visit_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    visitId,
    type,
    fromStatus ?? null,
    toStatus ?? null,
    fromLocationId ?? null,
    toLocationId ?? null,
    fromQueueId ?? null,
    toQueueId ?? null,
    actorType,
    null,
    note,
    correlationId ?? null,
    new Date().toISOString(),
  );
}

function enrich(
  visitRow: Visit,
  data: Catalog,
  stepsForTemplateFn: CatalogRepository['stepsForTemplate'],
): VisitView {
  const steps = visitRow.journeyTemplateId
    ? stepsForTemplateFn(visitRow.journeyTemplateId, data.journeySteps)
    : [];
  return {
    ...visitRow,
    topic: data.topics.find((item) => item.id === visitRow.primaryTopicId),
    queue: data.queues.find((item) => item.id === visitRow.queueId),
    lastKnownLocation: data.locations.find((item) => item.id === visitRow.lastKnownLocationId),
    targetLocation: data.locations.find((item) => item.id === visitRow.targetLocationId),
    journeyTemplate: data.journeyTemplates.find((item) => item.id === visitRow.journeyTemplateId),
    journeyStepLabel:
      visitRow.journeyStepIndex != null
        ? (journeyStepLabel(steps, visitRow.journeyStepIndex) ?? undefined)
        : undefined,
  };
}

export function createVisitRepository(db: DatabaseSync, catalogRepository: CatalogRepository) {
  const visitById = (id: string): VisitView | undefined => {
    const row = db
      .prepare(
        `SELECT visits.*, patients.display_name AS patient_display_name
       FROM visits
       JOIN patients ON patients.id = visits.patient_id
       WHERE visits.id = ?`,
      )
      .get(id) as SqlRow | undefined;
    return row
      ? enrich(visit(row), catalogRepository.loadCatalog(), catalogRepository.stepsForTemplate)
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
    const data = catalogRepository.loadCatalog();
    return rows.map((row) => enrich(visit(row), data, catalogRepository.stepsForTemplate));
  };

  const events = (visitId: string): VisitEvent[] =>
    (
      db
        .prepare('SELECT * FROM visit_events WHERE visit_id = ? ORDER BY created_at')
        .all(visitId) as SqlRow[]
    ).map(event);

  return {
    visits,
    visitById,
    events,
    updateVisit: (current: Visit, patch: Partial<Visit>) => updateVisit(db, current, patch),
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
      eventOptions?: { correlationId?: string },
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
