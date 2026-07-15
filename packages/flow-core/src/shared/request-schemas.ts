import type {
  AuthPath,
  EscortPolicy,
  JourneyCompletedWhen,
  LocationConfidence,
  MovementMode,
  Priority,
  PublicDisplayMode,
  RedirectLocationSemantics,
} from './types.js';
import {
  COMPLETED_WHEN_VALUES,
  ESCORT_POLICIES,
  LOCATION_CONFIDENCES,
  MOVEMENT_MODES,
  PUBLIC_DISPLAY_MODES,
  REDIRECT_LOCATION_SEMANTICS,
  TRANSITION_ACTIONS,
  type TransitionAction,
} from './domain-enums.js';
import { AUTH_PATHS } from './auth-path.js';

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], code: string): T {
  if (!isString(value) || !allowed.includes(value as T)) throw new Error(code);
  return value as T;
}

export function parseCheckInBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('INVALID_REQUEST_BODY');
  const raw = body as Record<string, unknown>;
  const mfaAssist = Boolean(raw.mfaAssist);
  const needsAssistance = Boolean(raw.needsAssistance);
  const topicId = isString(raw.topicId) && raw.topicId.trim() ? raw.topicId.trim() : undefined;

  if (mfaAssist && (topicId || needsAssistance)) throw new Error('CHECKIN_MFA_ASSIST_EXCLUSIVE');
  if (needsAssistance && !topicId) throw new Error('CHECKIN_ASSISTANCE_REQUIRES_TOPIC');
  if (!mfaAssist && !topicId) throw new Error('CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED');

  const authPath: AuthPath = mfaAssist
    ? 'none'
    : assertEnum(raw.authPath ?? 'phone_dob', [...AUTH_PATHS], 'INVALID_AUTH_PATH');

  return {
    topicId,
    mfaAssist,
    authPath,
    surfaceId:
      isString(raw.surfaceId) && raw.surfaceId.trim() ? raw.surfaceId.trim() : 'terminal_1',
    displayName:
      isString(raw.displayName) && raw.displayName.trim() ? raw.displayName.trim() : undefined,
    needsAssistance,
    staffNote: isString(raw.staffNote) ? raw.staffNote : undefined,
  };
}

/** HTTP-Body fuer Visit-Transitionen — ohne Actor-Identitaet (Host injiziert actorId). */
export type TransitionRequestBody = {
  targetLocationId?: string | null;
  actingLocationId?: string;
};

export function parseTransitionBody(body: unknown): TransitionRequestBody {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  return {
    targetLocationId: 'targetLocationId' in raw ? nullableId(raw.targetLocationId) : undefined,
    actingLocationId:
      isString(raw.actingLocationId) && raw.actingLocationId.trim()
        ? raw.actingLocationId.trim()
        : undefined,
  };
}

export function parseSaveTopicBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('INVALID_REQUEST_BODY');
  const raw = body as Record<string, unknown>;
  if (!isString(raw.laneCode) || !raw.laneCode.trim()) throw new Error('INVALID_REQUEST_BODY');

  return {
    name: isString(raw.name) ? raw.name.trim() : '',
    category: isString(raw.category) ? raw.category.trim() : '',
    color: isString(raw.color) ? raw.color.trim() : '',
    defaultPriority: assertEnum(
      raw.defaultPriority ?? 'normal',
      ['low', 'normal', 'high', 'urgent'] as const,
      'INVALID_REQUEST_BODY',
    ) as Priority,
    estimatedDurationMin:
      typeof raw.estimatedDurationMin === 'number' ? raw.estimatedDurationMin : undefined,
    active: Boolean(raw.active),
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : 0,
    laneCode: raw.laneCode.trim().toUpperCase(),
  };
}

export function parseTransitionAction(action: string): TransitionAction {
  return assertEnum(action, TRANSITION_ACTIONS, 'UNKNOWN_ACTION');
}

export function parseRedirectBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('INVALID_REQUEST_BODY');
  const raw = body as Record<string, unknown>;

  return {
    ...('queueId' in raw ? { queueId: nullableId(raw.queueId) } : {}),
    ...('targetLocationId' in raw ? { targetLocationId: nullableId(raw.targetLocationId) } : {}),
    movementMode: assertEnum(
      raw.movementMode,
      MOVEMENT_MODES,
      'INVALID_MOVEMENT_MODE',
    ) as MovementMode,
    publicDisplayMode: assertEnum(
      raw.publicDisplayMode,
      PUBLIC_DISPLAY_MODES,
      'INVALID_PUBLIC_DISPLAY_MODE',
    ) as PublicDisplayMode,
    ...('staffNote' in raw ? { staffNote: nullableString(raw.staffNote) } : {}),
    actorSurfaceId:
      isString(raw.actorSurfaceId) && raw.actorSurfaceId.trim()
        ? raw.actorSurfaceId.trim()
        : 'mfa_dashboard',
    locationSemantics: (raw.locationSemantics == null
      ? 'instructed'
      : assertEnum(
          raw.locationSemantics,
          REDIRECT_LOCATION_SEMANTICS,
          'INVALID_REDIRECT_LOCATION_SEMANTICS',
        )) as RedirectLocationSemantics,
    ...('lastKnownLocationId' in raw
      ? { lastKnownLocationId: nullableId(raw.lastKnownLocationId) }
      : {}),
    terminalInstruction: isString(raw.terminalInstruction) ? raw.terminalInstruction : undefined,
    preserveTerminalInstruction: Boolean(raw.preserveTerminalInstruction),
  };
}

export function parseSaveRuleBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('INVALID_REQUEST_BODY');
  const raw = body as Record<string, unknown>;
  if (!isString(raw.topicId) || !raw.topicId.trim()) throw new Error('INVALID_REQUEST_BODY');

  const allowedSurfaceIds = Array.isArray(raw.allowedSurfaceIds)
    ? raw.allowedSurfaceIds
        .filter((item): item is string => isString(item) && item.trim().length > 0)
        .map((item) => item.trim())
    : undefined;

  return {
    topicId: raw.topicId.trim(),
    name: isString(raw.name) ? raw.name : '',
    active: Boolean(raw.active),
    initialLastKnownLocationId: nullableId(raw.initialLastKnownLocationId),
    initialTargetLocationId: nullableId(raw.initialTargetLocationId),
    initialQueueId: nullableId(raw.initialQueueId),
    initialMovementMode: assertEnum(
      raw.initialMovementMode,
      MOVEMENT_MODES,
      'INVALID_MOVEMENT_MODE',
    ) as MovementMode,
    initialLocationConfidence: assertEnum(
      raw.initialLocationConfidence ?? 'instructed',
      LOCATION_CONFIDENCES,
      'INVALID_LOCATION_CONFIDENCE',
    ) as LocationConfidence,
    publicDisplayMode: assertEnum(
      raw.publicDisplayMode,
      PUBLIC_DISPLAY_MODES,
      'INVALID_PUBLIC_DISPLAY_MODE',
    ) as PublicDisplayMode,
    terminalInstructionTemplate: isString(raw.terminalInstructionTemplate)
      ? raw.terminalInstructionTemplate
      : '',
    requiresReceptionConfirmation: Boolean(raw.requiresReceptionConfirmation),
    escortPolicy: assertEnum(
      raw.escortPolicy,
      ESCORT_POLICIES,
      'INVALID_ESCORT_POLICY',
    ) as EscortPolicy,
    allowRedirect: raw.allowRedirect == null ? true : Boolean(raw.allowRedirect),
    allowedSurfaceIds: allowedSurfaceIds?.length ? allowedSurfaceIds : undefined,
    journeyTemplateId: nullableId(raw.journeyTemplateId),
  };
}

export function parseSaveJourneyTemplateBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('INVALID_REQUEST_BODY');
  const raw = body as Record<string, unknown>;
  if (!isString(raw.name) || !raw.name.trim()) throw new Error('INVALID_REQUEST_BODY');

  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((step, index) => parseJourneyStepDraft(step, index))
    : [];

  return {
    name: raw.name.trim(),
    topicId: nullableId(raw.topicId),
    active: Boolean(raw.active),
    steps,
  };
}

function parseJourneyStepDraft(step: unknown, _index: number) {
  if (!step || typeof step !== 'object') throw new Error('INVALID_REQUEST_BODY');
  const raw = step as Record<string, unknown>;
  if (typeof raw.sortOrder !== 'number' || !Number.isInteger(raw.sortOrder)) {
    throw new Error('INVALID_REQUEST_BODY');
  }

  return {
    id: optionalId(raw.id),
    sortOrder: raw.sortOrder,
    targetLocationId: nullableId(raw.targetLocationId),
    queueId: nullableId(raw.queueId),
    movementMode: assertEnum(
      raw.movementMode,
      MOVEMENT_MODES,
      'INVALID_MOVEMENT_MODE',
    ) as MovementMode,
    publicDisplayMode: assertEnum(
      raw.publicDisplayMode,
      PUBLIC_DISPLAY_MODES,
      'INVALID_PUBLIC_DISPLAY_MODE',
    ) as PublicDisplayMode,
    completedWhen: assertEnum(
      raw.completedWhen,
      COMPLETED_WHEN_VALUES,
      'INVALID_COMPLETED_WHEN',
    ) as JourneyCompletedWhen,
    instructionText:
      isString(raw.instructionText) && raw.instructionText.trim()
        ? raw.instructionText.trim()
        : undefined,
  };
}

function nullableId(value: unknown): string | null {
  if (value == null) return null;
  if (!isString(value)) throw new Error('INVALID_REQUEST_BODY');
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  if (!isString(value)) throw new Error('INVALID_REQUEST_BODY');
  return value;
}

function optionalId(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (!isString(value)) throw new Error('INVALID_REQUEST_BODY');
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
