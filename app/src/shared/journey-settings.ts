import {
  COMPLETED_WHEN_VALUES,
  MOVEMENT_MODES,
  PUBLIC_DISPLAY_MODES,
} from '@praxis-flow/flow-core';
import { WAITING_ROOM_LOCATION_ID } from '@praxis-flow/domain';
import { isRecord } from './type-guards.js';

export type JourneyStepSetting = {
  id: string;
  sortOrder: number;
  targetLocationId: string | null;
  queueId: string | null;
  movementMode: string;
  publicDisplayMode: string;
  completedWhen: string;
  instructionText: string | null;
};

export type JourneyTemplateSetting = {
  id: string;
  name: string;
  topicId: string | null;
  active: boolean;
  steps: JourneyStepSetting[];
};

export type JourneySettings = {
  templates: JourneyTemplateSetting[];
};

export const EMPTY_JOURNEY_SETTINGS: JourneySettings = { templates: [] };

function isEnumMember<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function normalizeJourneyStep(
  raw: unknown,
  index: number,
  templateIndex: number,
): JourneyStepSetting | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (id.length === 0) return null;
  const sortOrder = typeof raw.sortOrder === 'number' ? raw.sortOrder : index;
  const movementMode = typeof raw.movementMode === 'string' ? raw.movementMode.trim() : '';
  const publicDisplayMode =
    typeof raw.publicDisplayMode === 'string' ? raw.publicDisplayMode.trim() : '';
  const completedWhen = typeof raw.completedWhen === 'string' ? raw.completedWhen.trim() : '';
  if (
    !isEnumMember(MOVEMENT_MODES, movementMode) ||
    !isEnumMember(PUBLIC_DISPLAY_MODES, publicDisplayMode) ||
    !isEnumMember(COMPLETED_WHEN_VALUES, completedWhen)
  ) {
    throw new Error(
      `JOURNEY_SETTINGS_INVALID: template ${templateIndex} step ${index} has invalid enums.`,
    );
  }
  return {
    id,
    sortOrder,
    targetLocationId:
      typeof raw.targetLocationId === 'string' && raw.targetLocationId.trim().length > 0
        ? raw.targetLocationId.trim()
        : null,
    queueId:
      typeof raw.queueId === 'string' && raw.queueId.trim().length > 0 ? raw.queueId.trim() : null,
    movementMode,
    publicDisplayMode,
    completedWhen,
    instructionText:
      typeof raw.instructionText === 'string' && raw.instructionText.trim().length > 0
        ? raw.instructionText.trim()
        : null,
  };
}

function normalizeJourneyTemplate(raw: unknown, index: number): JourneyTemplateSetting | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (id.length === 0 || name.length === 0) return null;
  const topicId =
    typeof raw.topicId === 'string' && raw.topicId.trim().length > 0 ? raw.topicId.trim() : null;
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = stepsRaw
    .map((step, stepIndex) => normalizeJourneyStep(step, stepIndex, index))
    .filter((step): step is JourneyStepSetting => step != null);
  return {
    id,
    name,
    topicId,
    active: raw.active !== false,
    steps,
  };
}

export function normalizeJourneySettings(parsed: unknown): JourneySettings {
  if (parsed == null) return EMPTY_JOURNEY_SETTINGS;
  if (!isRecord(parsed) || !Array.isArray(parsed.templates)) {
    throw new Error('JOURNEY_SETTINGS_INVALID');
  }
  const templates = parsed.templates
    .map((entry, index) => normalizeJourneyTemplate(entry, index))
    .filter((entry): entry is JourneyTemplateSetting => entry != null);
  const seenIds = new Set<string>();
  for (const template of templates) {
    if (seenIds.has(template.id)) {
      throw new Error(`JOURNEY_SETTINGS_INVALID: duplicate template id ${template.id}.`);
    }
    seenIds.add(template.id);
  }
  return { templates };
}

export function parseJourneySettingsJson(raw: string | undefined): JourneySettings {
  if (raw == null || raw.trim().length === 0) return EMPTY_JOURNEY_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('JOURNEY_SETTINGS_INVALID');
  }
  return normalizeJourneySettings(parsed);
}

export function validateTopicJourneyAssignments(
  topics: Array<{ topicId: string; journeyTemplateId?: string | null }>,
  journeySettings: JourneySettings,
): { ok: true } | { ok: false; message: string } {
  const templatesById = new Map(
    journeySettings.templates.map((template) => [template.id, template]),
  );
  for (const topic of topics) {
    const journeyTemplateId = topic.journeyTemplateId ?? null;
    if (!journeyTemplateId) continue;
    const template = templatesById.get(journeyTemplateId);
    if (!template?.active) {
      return {
        ok: false,
        message: `Topic ${topic.topicId} references unknown or inactive journey template.`,
      };
    }
    if (template.topicId && template.topicId !== topic.topicId) {
      return {
        ok: false,
        message: `Topic ${topic.topicId} cannot use journey template bound to ${template.topicId}.`,
      };
    }
  }
  return { ok: true };
}

export function validateJourneyStepTargets(
  journeySettings: JourneySettings,
  rooms: Array<{ roomId: string; enabled: boolean }>,
): { ok: true } | { ok: false; message: string } {
  const enabledLocationIds = new Set([
    WAITING_ROOM_LOCATION_ID,
    ...rooms.filter((room) => room.enabled).map((room) => room.roomId),
  ]);
  for (const template of journeySettings.templates) {
    for (const step of template.steps) {
      if (!step.targetLocationId || !enabledLocationIds.has(step.targetLocationId)) {
        return {
          ok: false,
          message: `Journey ${template.id} step ${step.id} targetLocationId is not an enabled room.`,
        };
      }
    }
  }
  return { ok: true };
}
