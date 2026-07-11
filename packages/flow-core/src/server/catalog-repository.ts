import type { DatabaseSync } from 'node:sqlite';
import type {
  Catalog,
  JourneyStep,
  JourneyTemplate,
  Location,
  Queue,
  RoutingRule,
  Surface,
  SurfaceDisplayRule,
  Topic,
} from '@praxis-flow/flow-core';

type SqlRow = Record<string, unknown>;

const bool = (value: unknown) => Boolean(value);
const opt = <T>(value: T | null | undefined) => value ?? undefined;
const str = (value: unknown) => String(value);

function topic(row: SqlRow): Topic {
  return {
    id: str(row.id),
    name: str(row.name),
    category: str(row.category),
    color: str(row.color),
    defaultPriority: row.default_priority as Topic['defaultPriority'],
    estimatedDurationMin: opt(row.estimated_duration_min as number | null),
    active: bool(row.active),
    sortOrder: Number(row.sort_order),
    laneCode: str(row.lane_code),
  };
}

function location(row: SqlRow): Location {
  return {
    id: str(row.id),
    name: str(row.name),
    type: row.type as Location['type'],
    canWait: bool(row.can_wait),
    canTreat: bool(row.can_treat),
    canCheckIn: bool(row.can_check_in),
    staffOnly: bool(row.staff_only),
    publicName: opt(row.public_name as string | null),
    active: bool(row.active),
    sortOrder: Number(row.sort_order),
  };
}

function queue(row: SqlRow): Queue {
  return {
    id: str(row.id),
    name: str(row.name),
    homeLocationId: opt(row.home_location_id as string | null),
    type: row.type as Queue['type'],
    sortPolicy: row.sort_policy as Queue['sortPolicy'],
    callPolicy: row.call_policy as Queue['callPolicy'],
    defaultMovementMode: row.default_movement_mode as Queue['defaultMovementMode'],
    active: bool(row.active),
    sortOrder: Number(row.sort_order),
  };
}

function surface(row: SqlRow): Surface {
  return {
    id: str(row.id),
    locationId: str(row.location_id),
    name: str(row.name),
    type: row.type as Surface['type'],
    audience: row.audience as Surface['audience'],
    showsQueue: bool(row.shows_queue),
    supportsCalling: bool(row.supports_calling),
    supportsConfirmation: bool(row.supports_confirmation),
    supportsRedirect: bool(row.supports_redirect),
    enabled: bool(row.enabled),
  };
}

function surfaceRule(row: SqlRow): SurfaceDisplayRule {
  return {
    id: str(row.id),
    surfaceId: str(row.surface_id),
    queueId: opt(row.queue_id as string | null),
    locationId: opt(row.location_id as string | null),
    topicId: opt(row.topic_id as string | null),
    displayMode: row.display_mode as SurfaceDisplayRule['displayMode'],
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function rule(row: SqlRow): RoutingRule {
  return {
    id: str(row.id),
    topicId: str(row.topic_id),
    name: str(row.name),
    initialLastKnownLocationId: opt(row.initial_last_known_location_id as string | null),
    initialTargetLocationId: opt(row.initial_target_location_id as string | null),
    initialQueueId: opt(row.initial_queue_id as string | null),
    initialMovementMode: row.initial_movement_mode as RoutingRule['initialMovementMode'],
    initialLocationConfidence: row.initial_location_confidence as RoutingRule['initialLocationConfidence'],
    publicDisplayMode: row.public_display_mode as RoutingRule['publicDisplayMode'],
    terminalInstructionTemplate: str(row.terminal_instruction_template),
    requiresReceptionConfirmation: bool(row.requires_reception_confirmation),
    escortPolicy: row.escort_policy as RoutingRule['escortPolicy'],
    allowRedirect: bool(row.allow_redirect),
    allowedSurfaceIds: parseAllowedSurfaceIds(row.allowed_surface_ids as string | null),
    journeyTemplateId: opt(row.journey_template_id as string | null),
    active: bool(row.active),
  };
}

function journeyTemplate(row: SqlRow): JourneyTemplate {
  return {
    id: str(row.id),
    name: str(row.name),
    topicId: opt(row.topic_id as string | null),
    active: bool(row.active),
  };
}

function journeyStep(row: SqlRow): JourneyStep {
  return {
    id: str(row.id),
    templateId: str(row.template_id),
    sortOrder: Number(row.sort_order),
    targetLocationId: opt(row.target_location_id as string | null),
    queueId: opt(row.queue_id as string | null),
    movementMode: row.movement_mode as JourneyStep['movementMode'],
    publicDisplayMode: row.public_display_mode as JourneyStep['publicDisplayMode'],
    completedWhen: row.completed_when as JourneyStep['completedWhen'],
    instructionText: opt(row.instruction_text as string | null),
  };
}

export function parseAllowedSurfaceIds(value: string | null | undefined): string[] | undefined {
  if (value == null || value === '') return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : undefined;
  } catch {
    return undefined;
  }
}

export function serializeAllowedSurfaceIds(ids: string[] | null | undefined): string | null {
  if (!ids?.length) return null;
  return JSON.stringify(ids);
}

export function loadCatalog(db: DatabaseSync): Catalog {
  return {
    topics: (db.prepare('SELECT * FROM topics ORDER BY sort_order').all() as SqlRow[]).map(topic),
    locations: (db.prepare('SELECT * FROM locations ORDER BY sort_order').all() as SqlRow[]).map(location),
    queues: (db.prepare('SELECT * FROM queues ORDER BY sort_order').all() as SqlRow[]).map(queue),
    surfaces: (db.prepare('SELECT * FROM surfaces ORDER BY name').all() as SqlRow[]).map(surface),
    surfaceDisplayRules: (db.prepare('SELECT * FROM surface_display_rules ORDER BY id').all() as SqlRow[]).map(
      surfaceRule,
    ),
    routingRules: (db.prepare('SELECT * FROM routing_rules ORDER BY name').all() as SqlRow[]).map(rule),
    journeyTemplates: (db.prepare('SELECT * FROM journey_templates ORDER BY name').all() as SqlRow[]).map(
      journeyTemplate,
    ),
    journeySteps: (db.prepare('SELECT * FROM journey_steps ORDER BY template_id, sort_order').all() as SqlRow[]).map(
      journeyStep,
    ),
  };
}

/** Host-Integration: Steps für ein Template laden. */
export function stepsForTemplate(templateId: string, allSteps: JourneyStep[]): JourneyStep[] {
  return allSteps.filter((step) => step.templateId === templateId).sort((left, right) => left.sortOrder - right.sortOrder);
}

export function createCatalogRepository(db: DatabaseSync) {
  return {
    loadCatalog: () => loadCatalog(db),
    stepsForTemplate,
    parseAllowedSurfaceIds,
    serializeAllowedSurfaceIds,
  };
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
