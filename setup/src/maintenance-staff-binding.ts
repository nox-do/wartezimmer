import type { ComposeStatus } from '@praxis-flow/server-shared';
import { validateStaffBindingEnv } from './docker.js';
import { createRuntimePostcondition, runtimeBindingError } from './runtime-postcondition.js';
import type { NetworkInterfaceInfo } from './network.js';

export function maintenanceStaffBindingPreflightError(input: {
  currentEnv: Map<string, string>;
  targetEnv: Map<string, string>;
  interfaces: NetworkInterfaceInfo[];
}): string | null {
  const current = validateStaffBindingEnv(input.currentEnv, input.interfaces);
  if (current) return `Aktueller Netzwerkzustand ungültig: ${current}`;
  const target = validateStaffBindingEnv(input.targetEnv, input.interfaces);
  return target ? `Geplanter Netzwerkzustand ungültig: ${target}` : null;
}

export function maintenanceStaffBindingRuntimeError(
  env: Map<string, string>,
  compose: ComposeStatus,
): string | null {
  return runtimeBindingError(createRuntimePostcondition(env, null), compose);
}
