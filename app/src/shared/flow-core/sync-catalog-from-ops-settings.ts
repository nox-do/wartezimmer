import type { DatabaseSync } from 'node:sqlite';
/**
 * Projects ops_settings (topics, rooms, journeys) into flow-core catalog tables.
 * Sole production writer for catalog DML — see docs/architecture/domain.md.
 */
import { validateCatalogIntegrity } from '@praxis-flow/flow-core';
import { loadCatalog } from '@praxis-flow/flow-core/server';
import {
  resolveDefaultCallRoomId,
  roomHasAnyEnabledPanel,
  roomPanelConfigForPlacement,
} from '@praxis-flow/domain';
import type { OpsSettings } from '../db/db-types.js';
import { EMPTY_JOURNEY_SETTINGS } from '../journey-settings.js';
import {
  MFA_ASSIST_LANE_CODE,
  MFA_ASSIST_TOPIC_ID,
  resolveTopicLabelFromSettings,
} from '../checkin-topic-settings.js';
import {
  PF_FLOW_LOC_ENTRANCE,
  PF_FLOW_LOC_WAITING,
  PF_FLOW_QUEUE_GENERAL,
  PF_FLOW_SURFACE_MFA,
  PF_FLOW_SURFACE_TERMINAL,
  PF_FLOW_SURFACE_TV,
} from './catalog-ids.js';

export {
  PF_FLOW_LOC_ENTRANCE,
  PF_FLOW_LOC_WAITING,
  PF_FLOW_QUEUE_GENERAL,
  PF_FLOW_SURFACE_MFA,
  PF_FLOW_SURFACE_TERMINAL,
  PF_FLOW_SURFACE_TV,
} from './catalog-ids.js';

/** True when ops_settings.routingMode is not complex (journeys not projected). */
export function isSimpleRoutingMode(settings: Pick<OpsSettings, 'routingMode'>): boolean {
  return settings.routingMode === 'simple';
}

export type SimpleRoutingRuleRow = {
  id: string;
  topicId: string;
  name: string;
  initialLastKnownLocationId: string;
  initialTargetLocationId: string;
  initialQueueId: string;
  initialMovementMode: string;
  initialLocationConfidence: string;
  publicDisplayMode: string;
  terminalInstructionTemplate: string;
  requiresReceptionConfirmation: number;
  escortPolicy: string;
  allowRedirect: number;
  allowedSurfaceIds: string | null;
  journeyTemplateId: string | null;
  active: number;
};

export function buildSimpleRoutingRuleRow(input: {
  topicId: string;
  name: string;
  targetLocationId: string;
  terminalInstructionTemplate: string;
  allowRedirect: boolean;
  active: boolean;
}): SimpleRoutingRuleRow {
  return {
    id: `rule_${input.topicId}`,
    topicId: input.topicId,
    name: input.name,
    initialLastKnownLocationId: PF_FLOW_LOC_WAITING,
    initialTargetLocationId: input.targetLocationId,
    initialQueueId: PF_FLOW_QUEUE_GENERAL,
    initialMovementMode: input.targetLocationId === PF_FLOW_LOC_WAITING ? 'call' : 'self_go',
    initialLocationConfidence: 'assumed',
    publicDisplayMode: 'visible',
    terminalInstructionTemplate: input.terminalInstructionTemplate,
    requiresReceptionConfirmation: 0,
    escortPolicy: 'none',
    allowRedirect: input.allowRedirect ? 1 : 0,
    allowedSurfaceIds: JSON.stringify([PF_FLOW_SURFACE_TERMINAL]),
    journeyTemplateId: null,
    active: input.active ? 1 : 0,
  };
}

export function panelFlowSurfaceId(roomId: string): string {
  return `pf_panel_${roomId}`;
}

export type CatalogSyncSummary = {
  topics: number;
  locations: number;
  queues: number;
  surfaces: number;
  routingRules: number;
  displayRules: number;
};

function bindList(values: string[]): string {
  return values.map(() => '?').join(', ');
}

function upsertTopic(
  db: DatabaseSync,
  row: {
    id: string;
    name: string;
    category: string;
    color: string;
    defaultPriority: string;
    active: number;
    sortOrder: number;
    laneCode: string;
  },
): void {
  db.prepare(
    `INSERT INTO topics (id, name, category, color, default_priority, estimated_duration_min, active, sort_order, lane_code)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       color = excluded.color,
       default_priority = excluded.default_priority,
       active = excluded.active,
       sort_order = excluded.sort_order,
       lane_code = excluded.lane_code`,
  ).run(
    row.id,
    row.name,
    row.category,
    row.color,
    row.defaultPriority,
    row.active,
    row.sortOrder,
    row.laneCode,
  );
}

function upsertLocation(
  db: DatabaseSync,
  row: {
    id: string;
    name: string;
    type: string;
    canWait: number;
    canTreat: number;
    canCheckIn: number;
    staffOnly: number;
    publicName: string;
    active: number;
    sortOrder: number;
  },
): void {
  db.prepare(
    `INSERT INTO locations (id, name, type, can_wait, can_treat, can_check_in, staff_only, public_name, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       can_wait = excluded.can_wait,
       can_treat = excluded.can_treat,
       can_check_in = excluded.can_check_in,
       staff_only = excluded.staff_only,
       public_name = excluded.public_name,
       active = excluded.active,
       sort_order = excluded.sort_order`,
  ).run(
    row.id,
    row.name,
    row.type,
    row.canWait,
    row.canTreat,
    row.canCheckIn,
    row.staffOnly,
    row.publicName,
    row.active,
    row.sortOrder,
  );
}

function upsertQueue(
  db: DatabaseSync,
  row: {
    id: string;
    name: string;
    homeLocationId: string;
    type: string;
    sortPolicy: string;
    callPolicy: string;
    defaultMovementMode: string;
    active: number;
    sortOrder: number;
  },
): void {
  db.prepare(
    `INSERT INTO queues (id, name, home_location_id, type, sort_policy, call_policy, default_movement_mode, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       home_location_id = excluded.home_location_id,
       type = excluded.type,
       sort_policy = excluded.sort_policy,
       call_policy = excluded.call_policy,
       default_movement_mode = excluded.default_movement_mode,
       active = excluded.active,
       sort_order = excluded.sort_order`,
  ).run(
    row.id,
    row.name,
    row.homeLocationId,
    row.type,
    row.sortPolicy,
    row.callPolicy,
    row.defaultMovementMode,
    row.active,
    row.sortOrder,
  );
}

function upsertSurface(
  db: DatabaseSync,
  row: {
    id: string;
    locationId: string;
    name: string;
    type: string;
    audience: string;
    showsQueue: number;
    supportsCalling: number;
    supportsConfirmation: number;
    supportsRedirect: number;
    enabled: number;
  },
): void {
  db.prepare(
    `INSERT INTO surfaces (id, location_id, name, type, audience, shows_queue, supports_calling, supports_confirmation, supports_redirect, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       location_id = excluded.location_id,
       name = excluded.name,
       type = excluded.type,
       audience = excluded.audience,
       shows_queue = excluded.shows_queue,
       supports_calling = excluded.supports_calling,
       supports_confirmation = excluded.supports_confirmation,
       supports_redirect = excluded.supports_redirect,
       enabled = excluded.enabled`,
  ).run(
    row.id,
    row.locationId,
    row.name,
    row.type,
    row.audience,
    row.showsQueue,
    row.supportsCalling,
    row.supportsConfirmation,
    row.supportsRedirect,
    row.enabled,
  );
}

function insertDisplayRule(
  db: DatabaseSync,
  row: {
    id: string;
    surfaceId: string;
    queueId: string | null;
    locationId: string | null;
    topicId: string | null;
    displayMode: string;
    sortOrder: number;
  },
): void {
  db.prepare(
    `INSERT INTO surface_display_rules (id, surface_id, queue_id, location_id, topic_id, display_mode, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.surfaceId,
    row.queueId,
    row.locationId,
    row.topicId,
    row.displayMode,
    row.sortOrder,
  );
}

function upsertJourneyTemplate(
  db: DatabaseSync,
  row: {
    id: string;
    name: string;
    topicId: string | null;
    active: number;
  },
): void {
  db.prepare(
    `INSERT INTO journey_templates (id, name, topic_id, active)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       topic_id = excluded.topic_id,
       active = excluded.active`,
  ).run(row.id, row.name, row.topicId, row.active);
}

function upsertJourneyStep(
  db: DatabaseSync,
  row: {
    id: string;
    templateId: string;
    sortOrder: number;
    targetLocationId: string | null;
    queueId: string | null;
    movementMode: string;
    publicDisplayMode: string;
    completedWhen: string;
    instructionText: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO journey_steps (
      id, template_id, sort_order, target_location_id, queue_id,
      movement_mode, public_display_mode, completed_when, instruction_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      template_id = excluded.template_id,
      sort_order = excluded.sort_order,
      target_location_id = excluded.target_location_id,
      queue_id = excluded.queue_id,
      movement_mode = excluded.movement_mode,
      public_display_mode = excluded.public_display_mode,
      completed_when = excluded.completed_when,
      instruction_text = excluded.instruction_text`,
  ).run(
    row.id,
    row.templateId,
    row.sortOrder,
    row.targetLocationId,
    row.queueId,
    row.movementMode,
    row.publicDisplayMode,
    row.completedWhen,
    row.instructionText,
  );
}

function deactivateJourneyTemplatesOutside(db: DatabaseSync, templateIds: string[]): void {
  if (templateIds.length === 0) {
    db.prepare('UPDATE journey_templates SET active = 0').run();
    return;
  }
  db.prepare(
    `UPDATE journey_templates SET active = 0 WHERE id NOT IN (${bindList(templateIds)})`,
  ).run(...templateIds);
}

function deactivateJourneyStepsOutside(db: DatabaseSync, stepIds: string[]): void {
  if (stepIds.length === 0) {
    db.prepare('DELETE FROM journey_steps').run();
    return;
  }
  db.prepare(`DELETE FROM journey_steps WHERE id NOT IN (${bindList(stepIds)})`).run(...stepIds);
}

function journeySettingsFrom(
  settings: Pick<OpsSettings, 'journeySettings'>,
): OpsSettings['journeySettings'] {
  return settings.journeySettings ?? EMPTY_JOURNEY_SETTINGS;
}

export function syncJourneyTemplatesFromOpsSettings(db: DatabaseSync, settings: OpsSettings): void {
  const desiredTemplateIds: string[] = [];
  const desiredStepIds: string[] = [];

  for (const template of journeySettingsFrom(settings).templates) {
    desiredTemplateIds.push(template.id);
    upsertJourneyTemplate(db, {
      id: template.id,
      name: template.name,
      topicId: template.topicId,
      active: template.active ? 1 : 0,
    });
    for (const step of template.steps) {
      desiredStepIds.push(step.id);
      upsertJourneyStep(db, {
        id: step.id,
        templateId: template.id,
        sortOrder: step.sortOrder,
        targetLocationId: step.targetLocationId,
        queueId: step.queueId,
        movementMode: step.movementMode,
        publicDisplayMode: step.publicDisplayMode,
        completedWhen: step.completedWhen,
        instructionText: step.instructionText,
      });
    }
  }

  deactivateJourneyStepsOutside(db, desiredStepIds);
  deactivateJourneyTemplatesOutside(db, desiredTemplateIds);
}

export function buildJourneyRoutingRuleRow(input: {
  topicId: string;
  name: string;
  journeyTemplateId: string;
  targetLocationId: string;
  terminalInstructionTemplate: string;
  allowRedirect: boolean;
  active: boolean;
}): SimpleRoutingRuleRow {
  return {
    ...buildSimpleRoutingRuleRow({
      topicId: input.topicId,
      name: input.name,
      targetLocationId: input.targetLocationId,
      terminalInstructionTemplate: input.terminalInstructionTemplate,
      allowRedirect: input.allowRedirect,
      active: input.active,
    }),
    journeyTemplateId: input.journeyTemplateId,
  };
}

function resolveTopicJourneyTemplateId(
  topic: OpsSettings['topics'][number],
  settings: OpsSettings,
): string | null {
  const journeyTemplateId = topic.journeyTemplateId ?? null;
  if (!journeyTemplateId) return null;
  const template = journeySettingsFrom(settings).templates.find(
    (entry) => entry.id === journeyTemplateId,
  );
  return template?.active ? journeyTemplateId : null;
}

function buildMfaRoutingRuleRow(settings: OpsSettings): SimpleRoutingRuleRow {
  const label = resolveTopicLabelFromSettings(settings, MFA_ASSIST_TOPIC_ID);
  const targetLocationId = resolveDefaultCallTargetLocationId(settings);
  return {
    ...buildSimpleRoutingRuleRow({
      topicId: MFA_ASSIST_TOPIC_ID,
      name: label,
      targetLocationId,
      terminalInstructionTemplate: terminalInstructionForTopic(label, targetLocationId, settings),
      allowRedirect: false,
      active: true,
    }),
    initialLastKnownLocationId: PF_FLOW_LOC_ENTRANCE,
    initialMovementMode: targetLocationId === PF_FLOW_LOC_WAITING ? 'call' : 'self_go',
  };
}

export function syncComplexRoutingRulesFromOpsSettings(
  db: DatabaseSync,
  settings: OpsSettings,
): void {
  upsertRoutingRule(db, buildMfaRoutingRuleRow(settings));

  for (const topic of settings.topics) {
    const journeyTemplateId = resolveTopicJourneyTemplateId(topic, settings);
    const targetLocationId = resolveTargetLocationId(topic.defaultRoomId, settings);
    const terminalInstruction = terminalInstructionForTopic(
      topic.label,
      targetLocationId,
      settings,
    );
    const allowRedirect = topic.topicId !== MFA_ASSIST_TOPIC_ID;

    if (journeyTemplateId) {
      upsertRoutingRule(
        db,
        buildJourneyRoutingRuleRow({
          topicId: topic.topicId,
          name: topic.label,
          journeyTemplateId,
          targetLocationId,
          terminalInstructionTemplate: terminalInstruction,
          allowRedirect,
          active: topic.enabled,
        }),
      );
      continue;
    }

    upsertRoutingRule(
      db,
      buildSimpleRoutingRuleRow({
        topicId: topic.topicId,
        name: topic.label,
        targetLocationId,
        terminalInstructionTemplate: terminalInstruction,
        allowRedirect,
        active: topic.enabled,
      }),
    );
  }
}

function upsertRoutingRule(
  db: DatabaseSync,
  row: {
    id: string;
    topicId: string;
    name: string;
    initialLastKnownLocationId: string;
    initialTargetLocationId: string;
    initialQueueId: string;
    initialMovementMode: string;
    initialLocationConfidence: string;
    publicDisplayMode: string;
    terminalInstructionTemplate: string;
    requiresReceptionConfirmation: number;
    escortPolicy: string;
    allowRedirect: number;
    allowedSurfaceIds: string | null;
    journeyTemplateId: string | null;
    active: number;
  },
): void {
  db.prepare(
    `INSERT INTO routing_rules (
      id, topic_id, name,
      initial_last_known_location_id, initial_target_location_id, initial_queue_id,
      initial_movement_mode, initial_location_confidence, public_display_mode,
      terminal_instruction_template, requires_reception_confirmation,
      escort_policy, allow_redirect, allowed_surface_ids, journey_template_id, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      topic_id = excluded.topic_id,
      name = excluded.name,
      initial_last_known_location_id = excluded.initial_last_known_location_id,
      initial_target_location_id = excluded.initial_target_location_id,
      initial_queue_id = excluded.initial_queue_id,
      initial_movement_mode = excluded.initial_movement_mode,
      initial_location_confidence = excluded.initial_location_confidence,
      public_display_mode = excluded.public_display_mode,
      terminal_instruction_template = excluded.terminal_instruction_template,
      requires_reception_confirmation = excluded.requires_reception_confirmation,
      escort_policy = excluded.escort_policy,
      allow_redirect = excluded.allow_redirect,
      allowed_surface_ids = excluded.allowed_surface_ids,
      journey_template_id = excluded.journey_template_id,
      active = excluded.active`,
  ).run(
    row.id,
    row.topicId,
    row.name,
    row.initialLastKnownLocationId,
    row.initialTargetLocationId,
    row.initialQueueId,
    row.initialMovementMode,
    row.initialLocationConfidence,
    row.publicDisplayMode,
    row.terminalInstructionTemplate,
    row.requiresReceptionConfirmation,
    row.escortPolicy,
    row.allowRedirect,
    row.allowedSurfaceIds,
    row.journeyTemplateId,
    row.active,
  );
}

function resolveReceptionRoomId(settings: OpsSettings): string {
  const reception = settings.rooms.find((room) => room.roomId === 'mfa-tresen' && room.enabled);
  if (reception) return reception.roomId;
  const fallback = settings.rooms.find((room) => room.enabled);
  return fallback?.roomId ?? PF_FLOW_LOC_WAITING;
}

function resolveDefaultCallTargetLocationId(settings: OpsSettings): string {
  return resolveDefaultCallRoomId(settings.rooms) ?? PF_FLOW_LOC_WAITING;
}

function resolveTargetLocationId(topicDefaultRoomId: string, settings: OpsSettings): string {
  if (topicDefaultRoomId === PF_FLOW_LOC_WAITING) return PF_FLOW_LOC_WAITING;
  const room = settings.rooms.find((entry) => entry.roomId === topicDefaultRoomId);
  if (room?.enabled) return room.roomId;
  return resolveDefaultCallTargetLocationId(settings);
}

function terminalInstructionForTopic(
  label: string,
  targetLocationId: string,
  settings: OpsSettings,
): string {
  if (targetLocationId === PF_FLOW_LOC_WAITING) {
    return `Bitte nehmen Sie im Wartezimmer Platz. Sie werden für „${label}“ aufgerufen.`;
  }
  const roomLabel = settings.rooms.find((room) => room.roomId === targetLocationId)?.roomLabel;
  return `Bitte gehen Sie direkt zu „${roomLabel?.trim() || targetLocationId}“.`;
}

function deactivateTopicsOutside(db: DatabaseSync, topicIds: string[]): void {
  db.prepare(`UPDATE topics SET active = 0 WHERE id NOT IN (${bindList(topicIds)})`).run(
    ...topicIds,
  );
}

function deactivateLocationsOutside(db: DatabaseSync, locationIds: string[]): void {
  db.prepare(`UPDATE locations SET active = 0 WHERE id NOT IN (${bindList(locationIds)})`).run(
    ...locationIds,
  );
}

function deactivateRoutingRulesOutside(db: DatabaseSync, topicIds: string[]): void {
  db.prepare(
    `UPDATE routing_rules SET active = 0 WHERE topic_id NOT IN (${bindList(topicIds)})`,
  ).run(...topicIds);
}

function deactivatePanelSurfacesOutside(db: DatabaseSync, surfaceIds: string[]): void {
  if (surfaceIds.length === 0) {
    db.prepare("UPDATE surfaces SET enabled = 0 WHERE id LIKE 'pf_panel_%'").run();
    return;
  }

  db.prepare(
    `UPDATE surfaces SET enabled = 0 WHERE id LIKE 'pf_panel_%' AND id NOT IN (${bindList(surfaceIds)})`,
  ).run(...surfaceIds);
}

function replaceGeneratedDisplayRules(db: DatabaseSync): void {
  db.prepare(
    "DELETE FROM surface_display_rules WHERE id = 'tv_general_visible' OR id LIKE 'panel_%_target'",
  ).run();
}

export function syncSimpleRoutingRulesFromOpsSettings(
  db: DatabaseSync,
  settings: OpsSettings,
): void {
  upsertRoutingRule(db, buildMfaRoutingRuleRow(settings));

  for (const topic of settings.topics) {
    const targetLocationId = resolveTargetLocationId(topic.defaultRoomId, settings);
    upsertRoutingRule(
      db,
      buildSimpleRoutingRuleRow({
        topicId: topic.topicId,
        name: topic.label,
        targetLocationId,
        terminalInstructionTemplate: terminalInstructionForTopic(
          topic.label,
          targetLocationId,
          settings,
        ),
        allowRedirect: topic.topicId !== MFA_ASSIST_TOPIC_ID,
        active: topic.enabled,
      }),
    );
  }
}

export function syncRoutingRulesFromOpsSettings(db: DatabaseSync, settings: OpsSettings): void {
  if (isSimpleRoutingMode(settings)) {
    syncSimpleRoutingRulesFromOpsSettings(db, settings);
    return;
  }

  syncJourneyTemplatesFromOpsSettings(db, settings);
  syncComplexRoutingRulesFromOpsSettings(db, settings);
}

export function syncCatalogFromOpsSettings(
  db: DatabaseSync,
  settings: OpsSettings,
): CatalogSyncSummary {
  const desiredTopicIds = [MFA_ASSIST_TOPIC_ID, ...settings.topics.map((topic) => topic.topicId)];
  const desiredLocationIds = [
    PF_FLOW_LOC_ENTRANCE,
    PF_FLOW_LOC_WAITING,
    ...settings.rooms.map((room) => room.roomId),
  ];
  const desiredPanelSurfaceIds = settings.rooms
    .filter((room) => room.enabled && roomHasAnyEnabledPanel(room))
    .map((room) => panelFlowSurfaceId(room.roomId));

  deactivateTopicsOutside(db, desiredTopicIds);
  deactivateLocationsOutside(db, desiredLocationIds);
  deactivateRoutingRulesOutside(db, desiredTopicIds);
  deactivatePanelSurfacesOutside(db, desiredPanelSurfaceIds);
  replaceGeneratedDisplayRules(db);

  const receptionRoomId = resolveReceptionRoomId(settings);

  upsertLocation(db, {
    id: PF_FLOW_LOC_ENTRANCE,
    name: 'Eingang',
    type: 'entrance',
    canWait: 0,
    canTreat: 0,
    canCheckIn: 1,
    staffOnly: 0,
    publicName: 'Eingang',
    active: 1,
    sortOrder: 10,
  });
  upsertLocation(db, {
    id: PF_FLOW_LOC_WAITING,
    name: 'Wartezimmer',
    type: 'waiting_area',
    canWait: 1,
    canTreat: 0,
    canCheckIn: 0,
    staffOnly: 0,
    publicName: 'Wartezimmer',
    active: 1,
    sortOrder: 20,
  });

  let roomSort = 30;
  for (const room of settings.rooms) {
    const isReception = room.roomId === 'mfa-tresen';
    upsertLocation(db, {
      id: room.roomId,
      name: room.roomLabel,
      type: isReception ? 'reception' : 'treatment_room',
      canWait: 0,
      canTreat: isReception ? 0 : 1,
      canCheckIn: 0,
      staffOnly: 0,
      publicName: room.roomLabel,
      active: room.enabled ? 1 : 0,
      sortOrder: roomSort,
    });
    roomSort += 10;
  }

  upsertQueue(db, {
    id: PF_FLOW_QUEUE_GENERAL,
    name: 'Allgemeine Warteliste',
    homeLocationId: PF_FLOW_LOC_WAITING,
    type: 'location',
    sortPolicy: 'checkin_time',
    callPolicy: 'manual',
    defaultMovementMode: 'call',
    active: 1,
    sortOrder: 10,
  });

  upsertTopic(db, {
    id: MFA_ASSIST_TOPIC_ID,
    name: resolveTopicLabelFromSettings(settings, MFA_ASSIST_TOPIC_ID),
    category: 'mfa_assist',
    color: '#2563eb',
    defaultPriority: 'urgent',
    active: 1,
    sortOrder: 0,
    laneCode: MFA_ASSIST_LANE_CODE,
  });

  let topicCount = 1;
  for (const topic of settings.topics) {
    upsertTopic(db, {
      id: topic.topicId,
      name: topic.label,
      category: topic.iconId ?? 'general',
      color: topic.accentColor,
      defaultPriority: topic.topicId === MFA_ASSIST_TOPIC_ID ? 'urgent' : 'normal',
      active: topic.enabled ? 1 : 0,
      sortOrder: topic.sortOrder,
      laneCode: topic.laneCode,
    });
    topicCount += 1;
  }

  syncRoutingRulesFromOpsSettings(db, settings);

  upsertSurface(db, {
    id: PF_FLOW_SURFACE_TERMINAL,
    locationId: PF_FLOW_LOC_ENTRANCE,
    name: 'Terminal Eingang',
    type: 'terminal',
    audience: 'patient',
    showsQueue: 0,
    supportsCalling: 0,
    supportsConfirmation: 0,
    supportsRedirect: 0,
    enabled: 1,
  });
  upsertSurface(db, {
    id: PF_FLOW_SURFACE_TV,
    locationId: PF_FLOW_LOC_WAITING,
    name: 'Wartezimmer-TV',
    type: 'public_display',
    audience: 'public',
    showsQueue: 1,
    supportsCalling: 0,
    supportsConfirmation: 0,
    supportsRedirect: 0,
    enabled: 1,
  });
  upsertSurface(db, {
    id: PF_FLOW_SURFACE_MFA,
    locationId: receptionRoomId,
    name: 'MFA Dashboard',
    type: 'dashboard',
    audience: 'staff',
    showsQueue: 1,
    supportsCalling: 1,
    supportsConfirmation: 1,
    supportsRedirect: 1,
    enabled: 1,
  });

  let surfaceCount = 3;
  let displayRuleCount = 0;

  insertDisplayRule(db, {
    id: 'tv_general_visible',
    surfaceId: PF_FLOW_SURFACE_TV,
    queueId: PF_FLOW_QUEUE_GENERAL,
    locationId: null,
    topicId: null,
    displayMode: 'visible',
    sortOrder: 10,
  });
  displayRuleCount += 1;

  let panelIndex = 0;
  for (const room of settings.rooms) {
    if (!room.enabled || !roomHasAnyEnabledPanel(room)) continue;
    const insidePanel = roomPanelConfigForPlacement(room, 'inside');
    const supportsCalling = insidePanel.enabled && insidePanel.allowCalling ? 1 : 0;
    const surfaceId = panelFlowSurfaceId(room.roomId);
    upsertSurface(db, {
      id: surfaceId,
      locationId: room.roomId,
      name: `Raum-Panel ${room.roomLabel}`,
      type: 'staff_panel',
      audience: 'staff',
      showsQueue: 1,
      supportsCalling,
      supportsConfirmation: 1,
      supportsRedirect: 0,
      enabled: 1,
    });
    surfaceCount += 1;
    insertDisplayRule(db, {
      id: `panel_${room.roomId}_target`,
      surfaceId,
      queueId: null,
      locationId: room.roomId,
      topicId: null,
      displayMode: 'visible',
      sortOrder: 10 + panelIndex,
    });
    displayRuleCount += 1;
    panelIndex += 1;
  }

  const catalog = loadCatalog(db);
  validateCatalogIntegrity(catalog);

  return {
    topics: topicCount,
    locations: 2 + settings.rooms.length,
    queues: 1,
    surfaces: surfaceCount,
    routingRules: 1 + settings.topics.length,
    displayRules: displayRuleCount,
  };
}
