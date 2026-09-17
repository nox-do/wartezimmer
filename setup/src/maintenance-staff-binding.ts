import type { ComposeStatus } from '@praxis-flow/server-shared';
import { validateStaffBindingEnv } from './docker.js';
import { auditStaffPublishedBindings } from './network-bindings.js';
import type { NetworkInterfaceInfo } from './network.js';

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value?.trim() || '').toLowerCase());
}

function port(env: Map<string, string>, key: string, fallback: number): number {
  const value = Number(env.get(key));
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : fallback;
}

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
  if (!enabled(env.get('PROXY_ENABLED'))) return null;
  const proxyMode = env.get('PROXY_MODE')?.trim().toLowerCase() || 'off';
  const tlsState = env.get('TLS_STATE')?.trim().toLowerCase() || 'off';
  const checks = auditStaffPublishedBindings({
    compose,
    staffIp: env.get('SETUP_LAN_APP_IP')?.trim() || null,
    proxyEnabled: true,
    proxyHttpPort: port(env, 'PROXY_HTTP_PORT', 80),
    proxyHttpsEnabled:
      proxyMode === 'tls-managed' || proxyMode === 'tls-custom' || tlsState !== 'off',
    proxyHttpsPort: port(env, 'PROXY_HTTPS_PORT', 443),
    restrictedIp: enabled(env.get('SETUP_RESTRICTED_ENABLED'))
      ? env.get('SETUP_RESTRICTED_APP_IP')?.trim() || null
      : null,
  });
  const required = new Set(['staff.binding.app', 'staff.binding.sandbox', 'staff.binding.proxy']);
  const failed = checks.find((check) => required.has(check.id) && !check.ok);
  if (failed) return failed.detail ? `${failed.message} ${failed.detail}` : failed.message;
  const observed = new Set(
    checks.filter((check) => required.has(check.id)).map((check) => check.id),
  );
  const missing = [...required].find((id) => !observed.has(id));
  return missing ? `Runtime-Audit unvollständig: ${missing} fehlt.` : null;
}
