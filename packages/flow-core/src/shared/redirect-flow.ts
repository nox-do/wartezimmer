import type {
  Location,
  MovementMode,
  PublicDisplayMode,
  RedirectLocationSemantics,
  Visit,
} from './types.js';
import { movementTerminalInstruction } from './escort.js';
import { statusForMovementMode } from './visit-flow.js';

export type RedirectRequestBody = {
  targetLocationId?: string | null;
  queueId?: string | null;
  movementMode: MovementMode;
  publicDisplayMode: PublicDisplayMode;
  staffNote?: string;
  actorSurfaceId?: string;
  locationSemantics?: RedirectLocationSemantics;
  lastKnownLocationId?: string | null;
  terminalInstruction?: string;
  preserveTerminalInstruction?: boolean;
};

export function resolveRedirectVisitPatch(
  current: Visit,
  body: RedirectRequestBody,
  options: { targetLocation?: Pick<Location, 'name' | 'publicName'> } = {},
): Partial<Visit> {
  const semantics = body.locationSemantics ?? 'instructed';

  const patch: Partial<Visit> = {
    status: statusForMovementMode(body.movementMode),
    queueId: body.queueId ?? undefined,
    targetLocationId: body.targetLocationId ?? undefined,
    movementMode: body.movementMode,
    publicDisplayMode: body.publicDisplayMode,
    staffNote: body.staffNote,
    calledAt: undefined,
    arrivedAt: undefined,
    startedAt: undefined,
    journeyStepIndex: undefined,
    journeyStepCompletedAt: undefined,
  };

  if (semantics === 'instructed') {
    patch.locationConfidence = 'instructed';
  } else if (semantics === 'confirmed') {
    patch.locationConfidence = 'confirmed';
    patch.lastKnownLocationId =
      body.lastKnownLocationId ?? body.targetLocationId ?? current.lastKnownLocationId;
  } else {
    patch.locationConfidence = 'assumed';
    if ('lastKnownLocationId' in body) {
      patch.lastKnownLocationId = body.lastKnownLocationId ?? undefined;
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
