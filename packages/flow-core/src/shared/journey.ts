/**
 * Journey-Autopilot: Schritte in Visit-Patches, Advance nach Transition.
 *
 * Geplanter Export als Komponente in ein anderes Projekt. Bewusst wenig Kopplung
 * an diesen PoC — das Host-Projekt (runtime, DB, API) integriert über
 * stepToVisitPatch, advanceJourneyPatch und journeyStepLabel.
 *
 * Beim Mitnehmen: types.ts (JourneyStep, Visit), escort, visit-flow.
 * Dopplungen an Host-Grenzen (z. B. stepsForTemplate in catalog-repository,
 * stepsForJourneyTemplate in visit-context) sind Absicht — kein Shared-Monolith.
 */

import type {
  JourneyAdvanceOn,
  JourneyStep,
  Location,
  LocationConfidence,
  MovementMode,
  PublicDisplayMode,
  Visit,
  VisitStatus,
} from './types.js';
import type { TransitionAction } from './domain-enums.js';
import { applyEscortPolicyToMovementMode, movementTerminalInstruction, resolveTerminalInstruction } from './escort.js';
import { statusForMovementMode } from './visit-flow.js';

export type JourneyCompletedPatch = {
  journeyStepIndex: null;
  journeyState: 'completed';
};

export type JourneyVisitPatch = {
  targetLocationId: string | null;
  queueId: string | null;
  movementMode: MovementMode;
  publicDisplayMode: PublicDisplayMode;
  status: VisitStatus;
  locationConfidence: LocationConfidence;
  terminalInstruction?: string;
  calledAt?: null;
  startedAt?: null;
  arrivedAt?: null;
  journeyStepIndex?: number | null;
  journeyState?: 'completed';
};

export function formatStepFraction(index: number | null | undefined, stepCount: number): string | null {
  if (index == null || index < 0 || stepCount <= 0 || index >= stepCount) return null;
  return `${index + 1}/${stepCount}`;
}

export function stepToVisitPatch(
  step: JourneyStep,
  visit?: Pick<Visit, 'effectiveEscortPolicy'>,
  options: { targetLocation?: Pick<Location, 'name' | 'publicName'>; baseInstruction?: string } = {},
): JourneyVisitPatch {
  const originalMovementMode = step.movementMode;
  const movementMode = applyEscortPolicyToMovementMode(visit?.effectiveEscortPolicy, step.movementMode);
  const patch: JourneyVisitPatch = {
    targetLocationId: step.targetLocationId ?? null,
    queueId: step.queueId ?? null,
    movementMode,
    publicDisplayMode: step.publicDisplayMode,
    status: statusForMovementMode(movementMode),
    /** Hop-Wechsel: neues Ziel ist angewiesen; Check-in setzt assumed separat in runtime. */
    locationConfidence: 'instructed',
  };

  if (
    options.baseInstruction != null &&
    originalMovementMode === 'self_go' &&
    movementMode === 'pickup'
  ) {
    patch.terminalInstruction = resolveTerminalInstruction({
      baseInstruction: options.baseInstruction,
      movementMode,
      originalMovementMode,
      targetLocation: options.targetLocation,
    });
  }

  return patch;
}

export function shouldAdvanceOn(step: JourneyStep | undefined, action: TransitionAction): boolean {
  return Boolean(step && step.advanceOn === action);
}

export function advanceJourneyPatch(
  visit: Visit,
  action: TransitionAction,
  steps: JourneyStep[],
  options: { locations?: Location[] } = {},
): (JourneyVisitPatch & { journeyStepIndex: number }) | JourneyCompletedPatch | null {
  if (visit.journeyTemplateId == null || visit.journeyStepIndex == null) return null;

  const currentStep = steps[visit.journeyStepIndex];
  if (!shouldAdvanceOn(currentStep, action)) return null;

  const nextIndex = visit.journeyStepIndex + 1;
  const nextStep = steps[nextIndex];
  if (!nextStep) {
    return { journeyStepIndex: null, journeyState: 'completed' };
  }

  const targetLocation = options.locations?.find((location) => location.id === nextStep.targetLocationId);
  const patch = stepToVisitPatch(nextStep, visit, { targetLocation });
  patch.terminalInstruction = nextStep.instructionText?.trim()
    ? nextStep.instructionText.trim()
    : movementTerminalInstruction({
        movementMode: patch.movementMode,
        targetLocation,
      });
  /** Neuer Hop: Aufruf-/Start-Zeiten zuruecksetzen. arrivedAt nach arrive-Advance bleibt:
   *  es markiert die Ankunft am abgeschlossenen Hop-Ziel, nicht am neuen targetLocationId.
   *  Fuer Hop-Historie siehe visit_events; call() setzt arrivedAt fuer den naechsten Zyklus zurueck. */
  patch.calledAt = null;
  patch.startedAt = null;
  if (action !== 'arrive') {
    patch.arrivedAt = null;
  }
  // H7: Patient bereits am Ziel des naechsten Hops — kein erneuter waiting/call-Zyklus.
  if (action === 'arrive' && visit.lastKnownLocationId === nextStep.targetLocationId) {
    patch.status = 'arrived';
    if (!nextStep.instructionText?.trim()) {
      patch.terminalInstruction = 'Bitte warten Sie im Raum.';
    }
  }
  const { journeyStepIndex: _omit, journeyState: _omitState, ...hopPatch } = patch;
  return {
    journeyStepIndex: nextIndex,
    ...hopPatch,
  };
}

export function journeyStepLabel(steps: JourneyStep[], index: number | null | undefined): string | null {
  if (!steps?.length || index == null || index < 0 || index >= steps.length) return null;
  return formatStepFraction(index, steps.length);
}
