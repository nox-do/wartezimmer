import type { TranslationKey } from '$lib/i18n/core/translation-keys';
import type {
  JourneySettings,
  JourneyStepSetting,
  JourneyTemplateSetting,
  PracticeRoom,
} from '$lib/ops/openapi-types';
import { randomId } from '$lib/utils/random-id';
import { WAITING_ROOM_LABEL, WAITING_ROOM_LOCATION_ID } from '@wartezimmer/domain';

/**
 * Journey admin helpers — defaults, normalize, and UX validation for Ops Settings.
 *
 * ## UI fields intentionally hidden (model + API unchanged)
 *
 * **JourneyTemplateSetting**
 * - `topicId` — optional bindung an ein Anliegen; Zuweisung läuft primär über
 *   `PracticeTopicSetting.journeyTemplateId` am Anliegen. Wenn gesetzt, darf nur dieses
 *   Topic die Vorlage nutzen (Save-Validierung). UI-Feld folgt; Default `null`.
 * - `active` — Vorlage im Katalog verfügbar. Inaktive fehlen im Topic-Journey-Picker
 *   und werden beim Catalog-Sync nicht geroutet. Vor Deaktivieren Zuordnung am Anliegen
 *   lösen (Save-Validierung). UI-Toggle folgt; Default `true`.
 *
 * **JourneyStepSetting**
 * - `queueId` — defaults to `PF_GENERAL_QUEUE_ID` (single waiting room).
 *   Use `movementMode: self_go` for direct-to-room flows until a multi-queue UI exists.
 * - `instructionText` — optional routing hint for the patient (e.g. „2. Etage“, „rechts, weiße Tür“);
 *   maps to `visit.terminalInstruction` on hop changes. UI hidden until a surface shows it.
 */

export const PF_GENERAL_QUEUE_ID = 'pf_general_queue';

export const JOURNEY_MOVEMENT_MODES = ['call', 'self_go', 'pickup'] as const;
export const JOURNEY_DISPLAY_MODES = ['visible', 'hidden', 'call_only'] as const;
export const JOURNEY_COMPLETED_WHEN = ['arrive', 'start', 'done'] as const;

export type JourneyMovementMode = (typeof JOURNEY_MOVEMENT_MODES)[number];
export type JourneyDisplayMode = (typeof JOURNEY_DISPLAY_MODES)[number];
export type JourneyCompletedWhenMode = (typeof JOURNEY_COMPLETED_WHEN)[number];

export type JourneySettingsValidationResult =
  | { ok: true }
  | {
      ok: false;
      messageKey:
        | 'mfa.settings.journeyTemplateNameRequired'
        | 'mfa.settings.journeyStepTargetInvalid';
    };

const journeyMovementLabelKeys = {
  call: 'mfa.settings.journeyMovement.call',
  self_go: 'mfa.settings.journeyMovement.self_go',
  pickup: 'mfa.settings.journeyMovement.pickup',
} as const satisfies Record<JourneyMovementMode, TranslationKey>;

const journeyDisplayLabelKeys = {
  visible: 'mfa.settings.journeyDisplay.visible',
  hidden: 'mfa.settings.journeyDisplay.hidden',
  call_only: 'mfa.settings.journeyDisplay.call_only',
} as const satisfies Record<JourneyDisplayMode, TranslationKey>;

const journeyCompletedWhenLabelKeys = {
  arrive: 'mfa.settings.journeyCompletedWhen.arrive',
  start: 'mfa.settings.journeyCompletedWhen.start',
  done: 'mfa.settings.journeyCompletedWhen.done',
} as const satisfies Record<JourneyCompletedWhenMode, TranslationKey>;

export function journeyMovementLabelKey(mode: JourneyMovementMode): TranslationKey {
  return journeyMovementLabelKeys[mode];
}

export function journeyDisplayLabelKey(mode: JourneyDisplayMode): TranslationKey {
  return journeyDisplayLabelKeys[mode];
}

export function journeyCompletedWhenLabelKey(mode: JourneyCompletedWhenMode): TranslationKey {
  return journeyCompletedWhenLabelKeys[mode];
}

const journeyMovementHintKeys = {
  call: 'mfa.settings.journeyMovementHint.call',
  self_go: 'mfa.settings.journeyMovementHint.self_go',
  pickup: 'mfa.settings.journeyMovementHint.pickup',
} as const satisfies Record<JourneyMovementMode, TranslationKey>;

const journeyDisplayHintKeys = {
  visible: 'mfa.settings.journeyDisplayHint.visible',
  hidden: 'mfa.settings.journeyDisplayHint.hidden',
  call_only: 'mfa.settings.journeyDisplayHint.call_only',
} as const satisfies Record<JourneyDisplayMode, TranslationKey>;

const journeyCompletedWhenHintKeys = {
  arrive: 'mfa.settings.journeyCompletedWhenHint.arrive',
  start: 'mfa.settings.journeyCompletedWhenHint.start',
  done: 'mfa.settings.journeyCompletedWhenHint.done',
} as const satisfies Record<JourneyCompletedWhenMode, TranslationKey>;

export function journeyMovementHintKey(mode: JourneyMovementMode): TranslationKey {
  return journeyMovementHintKeys[mode];
}

export function journeyDisplayHintKey(mode: JourneyDisplayMode): TranslationKey {
  return journeyDisplayHintKeys[mode];
}

export function journeyCompletedWhenHintKey(mode: JourneyCompletedWhenMode): TranslationKey {
  return journeyCompletedWhenHintKeys[mode];
}

export function journeyStepRoomBadge(
  targetLocationId: string | null | undefined,
  rooms: PracticeRoom[],
): string {
  const label =
    (targetLocationId === WAITING_ROOM_LOCATION_ID ? WAITING_ROOM_LABEL : null) ||
    rooms.find((room) => room.roomId === targetLocationId)?.roomLabel?.trim() ||
    targetLocationId?.trim() ||
    '?';
  return label.toLocaleUpperCase('de-DE');
}

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
  rooms: PracticeRoom[],
  noStepsLabel: string,
): string {
  const hopLabels = template.steps
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((step, index) => {
      const target =
        (step.targetLocationId === WAITING_ROOM_LOCATION_ID ? WAITING_ROOM_LABEL : null) ??
        rooms.find((room) => room.roomId === step.targetLocationId)?.roomLabel ??
        step.targetLocationId ??
        '?';
      return `${index + 1}: ${target}`;
    });
  return `${template.name} · ${hopLabels.join(' → ') || noStepsLabel}`;
}

export function validateJourneySettingsForSave(
  settings: JourneySettings,
  enabledRoomIds: ReadonlySet<string>,
): JourneySettingsValidationResult {
  // UX-only precheck — server `normalizeJourneySettings` / catalog validation remain authoritative.
  for (const template of settings.templates) {
    if (!template.name.trim()) {
      return { ok: false, messageKey: 'mfa.settings.journeyTemplateNameRequired' };
    }

    for (const step of template.steps) {
      const targetId = step.targetLocationId?.trim();
      if (!targetId || (targetId !== WAITING_ROOM_LOCATION_ID && !enabledRoomIds.has(targetId))) {
        return { ok: false, messageKey: 'mfa.settings.journeyStepTargetInvalid' };
      }
    }
  }

  return { ok: true };
}

export function normalizeJourneySettingsForSave(settings: JourneySettings): JourneySettings {
  return {
    templates: settings.templates.map((template) => ({
      ...template,
      id: template.id.trim(),
      name: template.name.trim(),
      topicId: template.topicId?.trim() || null,
      steps: template.steps.map((step, stepIndex) => ({
        ...step,
        id: step.id.trim(),
        sortOrder: stepIndex,
        targetLocationId: step.targetLocationId?.trim() || null,
        queueId: step.queueId?.trim() || PF_GENERAL_QUEUE_ID,
        instructionText: step.instructionText?.trim() || null,
      })),
    })),
  };
}
