import type {
  Location,
  MovementMode,
  PublicDisplayMode,
  RedirectLocationSemantics,
  Visit,
  VisitPatch,
  VisitStatus,
} from './types.js';
import { movementTerminalInstruction } from './escort.js';
import { statusForMovementMode } from './visit-flow.js';

export type RedirectRequestBody = {
  targetLocationId?: string | null;
  queueId?: string | null;
  movementMode: MovementMode;
  publicDisplayMode: PublicDisplayMode;
  staffNote?: string | null;
  actorSurfaceId?: string;
  actorId?: string;
  locationSemantics?: RedirectLocationSemantics;
  lastKnownLocationId?: string | null;
  terminalInstruction?: string;
  preserveTerminalInstruction?: boolean;
};

export type RedirectVisitPatch = VisitPatch & { status: VisitStatus };

export function effectiveRedirectTargetLocationId(
  body: RedirectRequestBody,
  current: Pick<Visit, 'targetLocationId'>,
): string | null | undefined {
  return 'targetLocationId' in body ? body.targetLocationId : current.targetLocationId;
}

export function effectiveRedirectQueueId(
  body: RedirectRequestBody,
  current: Pick<Visit, 'queueId'>,
): string | null | undefined {
  return 'queueId' in body ? body.queueId : current.queueId;
}

export function resolveRedirectVisitPatch(
  current: Visit,
  body: RedirectRequestBody,
  options: { targetLocation?: Pick<Location, 'name' | 'publicName'> } = {},
): RedirectVisitPatch {
  const semantics = body.locationSemantics ?? 'instructed';
  const effectiveTargetLocationId = effectiveRedirectTargetLocationId(body, current);

  const patch: RedirectVisitPatch = {
    status: statusForMovementMode(body.movementMode),
    movementMode: body.movementMode,
    publicDisplayMode: body.publicDisplayMode,
    calledAt: null,
    arrivedAt: null,
    startedAt: null,
    journeyStepIndex: null,
    journeyStepCompletedAt: null,
  };

  if ('queueId' in body) {
    patch.queueId = body.queueId ?? null;
  }

  if ('targetLocationId' in body) {
    patch.targetLocationId = body.targetLocationId ?? null;
  }

  if ('staffNote' in body) {
    patch.staffNote = body.staffNote ?? null;
  }

  if (semantics === 'instructed') {
    patch.locationConfidence = 'instructed';
  } else if (semantics === 'confirmed') {
    patch.locationConfidence = 'confirmed';
    patch.lastKnownLocationId =
      body.lastKnownLocationId ?? effectiveTargetLocationId ?? current.lastKnownLocationId ?? null;
  } else {
    patch.locationConfidence = 'assumed';
    if ('lastKnownLocationId' in body) {
      patch.lastKnownLocationId = body.lastKnownLocationId ?? null;
    }
  }

  if (body.terminalInstruction != null && body.terminalInstruction !== '') {
    patch.terminalInstruction = body.terminalInstruction;
  } else if (body.preserveTerminalInstruction) {
    patch.terminalInstruction = current.terminalInstruction;
  } else {
    patch.terminalInstruction = movementTerminalInstruction({
      movementMode: body.movementMode,
      targetLocation: options.targetLocation,
    });
  }

  return patch;
}
