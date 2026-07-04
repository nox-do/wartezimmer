import type { EscortPolicy, Location, MovementMode } from './types.js';

export const ESCORT_RANK = { none: 0, recommended: 1, required: 2 } as const;

export function maxEscortPolicy(...policies: EscortPolicy[]): EscortPolicy {
  let best: EscortPolicy = 'none';
  let bestRank: (typeof ESCORT_RANK)[EscortPolicy] = ESCORT_RANK.none;
  for (const policy of policies) {
    const rank = ESCORT_RANK[policy] ?? ESCORT_RANK.none;
    if (rank > bestRank) {
      best = policy;
      bestRank = rank;
    }
  }
  return best;
}

export function effectiveEscortPolicy(configuredEscortPolicy: EscortPolicy): EscortPolicy {
  return configuredEscortPolicy;
}

/** EscortPolicy required verhindert self_go — operativ immer pickup. */
export function applyEscortPolicyToMovementMode(
  escortPolicy: EscortPolicy | undefined,
  movementMode: MovementMode,
): MovementMode {
  if (escortPolicy === 'required' && movementMode === 'self_go') {
    return 'pickup';
  }
  return movementMode;
}

export function escortTerminalInstruction(targetLocationName?: string): string {
  if (targetLocationName) {
    return `Bitte warten Sie. Sie werden nach ${targetLocationName} begleitet.`;
  }
  return 'Bitte warten Sie. Sie werden begleitet.';
}

export function movementTerminalInstruction(params: {
  movementMode: MovementMode;
  targetLocation?: Pick<Location, 'name' | 'publicName'>;
}): string {
  const { movementMode, targetLocation } = params;
  const target = targetLocation?.publicName || targetLocation?.name || 'Ihrem Ziel';

  if (movementMode === 'self_go') {
    return `Bitte gehen Sie zu ${target}.`;
  }

  if (movementMode === 'pickup') {
    return escortTerminalInstruction(target !== 'Ihrem Ziel' ? target : undefined);
  }

  if (movementMode === 'call') {
    return 'Bitte warten Sie. Sie werden aufgerufen.';
  }

  return 'Bitte warten Sie.';
}

export function resolveTerminalInstruction(params: {
  baseInstruction: string;
  movementMode: MovementMode;
  originalMovementMode: MovementMode;
  targetLocation?: Pick<Location, 'name' | 'publicName'>;
}): string {
  const { baseInstruction, movementMode, originalMovementMode, targetLocation } = params;
  if (originalMovementMode === 'self_go' && movementMode === 'pickup') {
    return movementTerminalInstruction({ movementMode, targetLocation });
  }
  return baseInstruction;
}
