import type {
  JourneySettings,
  JourneyStepSetting,
  JourneyTemplateSetting,
  PracticeRoom,
  PracticeTopicSetting,
} from '$lib/ops/openapi-types';
import { randomId } from '$lib/utils/random-id';

export const PF_GENERAL_QUEUE_ID = 'pf_general_queue';

export const JOURNEY_MOVEMENT_MODES = ['call', 'self_go', 'pickup'] as const;
export const JOURNEY_DISPLAY_MODES = ['visible', 'hidden', 'call_only'] as const;
export const JOURNEY_COMPLETED_WHEN = ['arrive', 'start', 'done'] as const;

export function createJourneyTemplateId(name: string, taken: Set<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'journey';
  let candidate = `journey-${base}`;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `journey-${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createDefaultJourneyStep(
  sortOrder: number,
  fallbackLocationId: string,
  previous?: JourneyStepSetting,
): JourneyStepSetting {
  return {
    id: `step_${randomId().slice(0, 8)}`,
    sortOrder,
    targetLocationId: previous?.targetLocationId ?? fallbackLocationId,
    queueId: previous?.queueId ?? PF_GENERAL_QUEUE_ID,
    movementMode: previous?.movementMode ?? 'call',
    publicDisplayMode: previous?.publicDisplayMode ?? 'visible',
    completedWhen: previous?.completedWhen ?? 'arrive',
    instructionText: null,
  };
}

export function createJourneyTemplate(
  name: string,
  taken: Set<string>,
  fallbackLocationId: string,
): JourneyTemplateSetting {
  const id = createJourneyTemplateId(name, taken);
  return {
    id,
    name,
    topicId: null,
    active: true,
    steps: [createDefaultJourneyStep(0, fallbackLocationId)],
  };
}

export function buildJourneyPreview(
  template: JourneyTemplateSetting,
  topics: PracticeTopicSetting[],
  rooms: PracticeRoom[],
): string {
  const topic = topics.find((entry) => entry.topicId === template.topicId);
  const hopLabels = template.steps
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((step, index) => {
      const target =
        rooms.find((room) => room.roomId === step.targetLocationId)?.roomLabel ??
        step.targetLocationId ??
        '?';
      return `${index + 1}: ${target}`;
    });
  const topicLabel = topic?.label ?? template.topicId ?? 'ohne Thema';
  return `${template.name} · ${topicLabel} · ${hopLabels.join(' → ') || 'keine Schritte'}`;
}

export function normalizeJourneySettingsForSave(settings: JourneySettings): JourneySettings {
  return {
    templates: settings.templates.map((template, templateIndex) => ({
      ...template,
      id: template.id.trim(),
      name: template.name.trim(),
      topicId: template.topicId?.trim() || null,
      steps: template.steps.map((step, stepIndex) => ({
        ...step,
        id: step.id.trim(),
        sortOrder: stepIndex,
        targetLocationId: step.targetLocationId?.trim() || null,
        queueId: step.queueId?.trim() || null,
        instructionText: step.instructionText?.trim() || null,
      })),
    })),
  };
}
