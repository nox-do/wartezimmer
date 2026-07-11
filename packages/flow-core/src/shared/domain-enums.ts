import type {
  EscortPolicy,
  JourneyCompletedWhen,
  LocationConfidence,
  MovementMode,
  PublicDisplayMode,
  RedirectLocationSemantics,
} from './types.js';

export const MOVEMENT_MODES = ['call', 'self_go', 'pickup'] as const satisfies readonly MovementMode[];
export const COMPLETED_WHEN_VALUES = ['arrive', 'start', 'done'] as const satisfies readonly JourneyCompletedWhen[];
export const REDIRECT_LOCATION_SEMANTICS = ['instructed', 'confirmed', 'unknown'] as const satisfies readonly RedirectLocationSemantics[];
export const ESCORT_POLICIES = ['none', 'recommended', 'required'] as const satisfies readonly EscortPolicy[];
export const LOCATION_CONFIDENCES = ['instructed', 'assumed', 'confirmed'] as const satisfies readonly LocationConfidence[];
export const PUBLIC_DISPLAY_MODES = ['visible', 'hidden', 'call_only'] as const satisfies readonly PublicDisplayMode[];
export const TRANSITION_ACTIONS = ['call', 'arrive', 'start', 'done', 'return_to_waiting'] as const;
export type TransitionAction = (typeof TRANSITION_ACTIONS)[number];
