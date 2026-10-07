import type {
  EscortPolicy,
  Location,
  LocationConfidence,
  MovementMode,
  RoutingRule,
  VisitStatus,
} from '@wartezimmer/flow-core';
import {
  applyEscortPolicyToMovementMode,
  resolveTerminalInstruction,
  statusForMovementMode,
} from '@wartezimmer/flow-core';

export function resolveCheckInRouting(params: {
  selectedRule: RoutingRule;
  effectiveEscortPolicy: EscortPolicy;
  locations: Location[];
}): {
  movementMode: MovementMode;
  terminalInstruction: string;
  queueId: string | undefined;
  targetLocationId: string | undefined;
  lastKnownLocationId: string | undefined;
  locationConfidence: LocationConfidence;
  status: VisitStatus;
} {
  const { selectedRule, effectiveEscortPolicy, locations } = params;
  const originalMovementMode = selectedRule.initialMovementMode;
  const movementMode = applyEscortPolicyToMovementMode(effectiveEscortPolicy, originalMovementMode);
  let terminalInstruction = selectedRule.terminalInstructionTemplate;

  if (movementMode !== originalMovementMode) {
    const target = locations.find(
      (location) => location.id === selectedRule.initialTargetLocationId,
    );
    terminalInstruction = resolveTerminalInstruction({
      baseInstruction: selectedRule.terminalInstructionTemplate,
      movementMode,
      originalMovementMode,
      targetLocation: target,
    });
  }

  return {
    movementMode,
    terminalInstruction,
    queueId: selectedRule.initialQueueId,
    targetLocationId: selectedRule.initialTargetLocationId,
    lastKnownLocationId: selectedRule.initialLastKnownLocationId,
    locationConfidence: selectedRule.initialLocationConfidence,
    status: statusForMovementMode(movementMode),
  };
}
