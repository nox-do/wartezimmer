import type { DatabaseSync } from 'node:sqlite';
import { validateCatalogIntegrity } from '@praxis-flow/flow-core';
import { loadCatalog } from '@praxis-flow/flow-core/server';
import type { OpsSettings } from '../db/db-types.js';
import { MFA_ASSIST_TOPIC_ID } from '../checkin-topic-settings.js';
import { clearFlowCoreCatalog } from './flow-core-spike-db.js';

export const PF_FLOW_LOC_ENTRANCE = 'pf_entrance';
export const PF_FLOW_LOC_WAITING = 'pf_waiting';
export const PF_FLOW_QUEUE_GENERAL = 'pf_general_queue';
export const PF_FLOW_SURFACE_TERMINAL = 'pf_terminal_1';
export const PF_FLOW_SURFACE_TV = 'pf_waiting_tv';
export const PF_FLOW_SURFACE_MFA = 'pf_mfa_dashboard';

export type CatalogSyncSummary = {
  topics: number;
  locations: number;
  queues: number;
  surfaces: number;
  routingRules: number;
  displayRules: number;
};

function insertTopic(
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
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
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

function insertLocation(
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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

function insertQueue(
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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

function insertSurface(
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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

function insertRoutingRule(
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  return fallback?.roomId ?? 'mfa-tresen';
}

function resolveTargetLocationId(topicDefaultRoomId: string, settings: OpsSettings): string {
  const room = settings.rooms.find((entry) => entry.roomId === topicDefaultRoomId);
  if (room?.enabled) return room.roomId;
  return resolveReceptionRoomId(settings);
}

function terminalInstructionForTopic(label: string): string {
  return `Bitte nehmen Sie im Wartezimmer Platz. Sie werden für „${label}“ aufgerufen.`;
}

export function syncCatalogFromOpsSettings(db: DatabaseSync, settings: OpsSettings): CatalogSyncSummary {
  clearFlowCoreCatalog(db);

  const receptionRoomId = resolveReceptionRoomId(settings);

  insertLocation(db, {
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
  insertLocation(db, {
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
    insertLocation(db, {
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

  insertQueue(db, {
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

  let topicCount = 0;
  for (const topic of settings.topics) {
    insertTopic(db, {
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

    if (!topic.enabled) continue;

    const targetLocationId = resolveTargetLocationId(topic.defaultRoomId, settings);
    const movementMode = topic.topicId === 'rezept' ? 'self_go' : 'call';
    const publicDisplayMode = topic.topicId === MFA_ASSIST_TOPIC_ID ? 'visible' : 'visible';

    insertRoutingRule(db, {
      id: `rule_${topic.topicId}`,
      topicId: topic.topicId,
      name: topic.label,
      initialLastKnownLocationId: PF_FLOW_LOC_WAITING,
      initialTargetLocationId: targetLocationId,
      initialQueueId: PF_FLOW_QUEUE_GENERAL,
      initialMovementMode: movementMode,
      initialLocationConfidence: 'assumed',
      publicDisplayMode,
      terminalInstructionTemplate: terminalInstructionForTopic(topic.label),
      requiresReceptionConfirmation: 0,
      escortPolicy: 'none',
      allowRedirect: topic.topicId === MFA_ASSIST_TOPIC_ID ? 0 : 1,
      allowedSurfaceIds: JSON.stringify([PF_FLOW_SURFACE_TERMINAL]),
      journeyTemplateId: null,
      active: 1,
    });
  }

  insertSurface(db, {
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
  insertSurface(db, {
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
  insertSurface(db, {
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
    if (!room.enabled || !room.panel?.enabled) continue;
    const surfaceId = `pf_panel_${room.roomId}`;
    insertSurface(db, {
      id: surfaceId,
      locationId: room.roomId,
      name: `Raum-Panel ${room.roomLabel}`,
      type: 'staff_panel',
      audience: 'staff',
      showsQueue: 1,
      supportsCalling: 0,
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
    routingRules: settings.topics.filter((topic) => topic.enabled).length,
    displayRules: displayRuleCount,
  };
}
