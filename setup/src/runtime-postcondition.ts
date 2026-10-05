import type { ComposeStatus, PortalProxyContract } from '@praxis-flow/server-shared';
import { readTlsStatus } from './host-tls.js';
import { auditStaffPublishedBindings } from './network-bindings.js';
import { auditRestrictedListeners } from './restricted-listener-probe.js';

export type RuntimePostcondition = {
  bindings: Omit<Parameters<typeof auditStaffPublishedBindings>[0], 'compose'>;
  restrictedEnabled: boolean;
  listeners: Parameters<typeof auditRestrictedListeners>[0] | null;
};

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value?.trim() || '').toLowerCase());
}

function port(env: ReadonlyMap<string, string>, key: string, fallback: number): number {
  const value = Number(env.get(key));
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : fallback;
}

/** Capture the intended state explicitly: candidate, release target, or restored snapshot. */
export function createRuntimePostcondition(
  env: Map<string, string>,
  contract: PortalProxyContract | null,
): RuntimePostcondition {
  const tls = readTlsStatus(env);
  const proxyMode = env.get('PROXY_MODE')?.trim().toLowerCase() || 'off';
  const tlsState = env.get('TLS_STATE')?.trim().toLowerCase() || 'off';
  const restrictedEnabled = enabled(env.get('SETUP_RESTRICTED_ENABLED'));
  const staffIp = env.get('SETUP_LAN_APP_IP')?.trim() || null;
  const restrictedIp = restrictedEnabled
    ? env.get('SETUP_RESTRICTED_APP_IP')?.trim() || null
    : null;
  const staffHttpsPort = port(env, 'PROXY_HTTPS_PORT', 443);
  return {
    bindings: {
      staffIp,
      proxyEnabled: enabled(env.get('PROXY_ENABLED')),
      proxyHttpPort: port(env, 'PROXY_HTTP_PORT', 80),
      proxyHttpsEnabled:
        proxyMode === 'tls-managed' || proxyMode === 'tls-custom' || tlsState !== 'off',
      proxyHttpsPort: staffHttpsPort,
      restrictedIp,
    },
    restrictedEnabled,
    listeners:
      restrictedEnabled &&
      staffIp &&
      restrictedIp &&
      tls.staffHostname &&
      tls.portalHostname &&
      contract
        ? {
            staffIp,
            restrictedIp,
            staffHostname: tls.staffHostname,
            portalHostname: tls.portalHostname,
            staffHttpsPort,
            contract: structuredClone(contract),
          }
        : null,
  };
}

export function runtimeBindingError(
  request: RuntimePostcondition,
  compose: ComposeStatus | null,
  audit: typeof auditStaffPublishedBindings = auditStaffPublishedBindings,
): string | null {
  // Preserve the existing initial/demo-mode policy; this audit concerns managed proxy access.
  if (!request.bindings.proxyEnabled) return null;
  const checks = audit({ ...request.bindings, compose });
  const required = ['staff.binding.app', 'staff.binding.sandbox', 'staff.binding.proxy'];
  const failed = checks.find((check) => required.includes(check.id) && !check.ok);
  if (failed) return failed.detail ? `${failed.message} ${failed.detail}` : failed.message;
  const missing = required.find((id) => !checks.some((check) => check.id === id));
  return missing ? `Runtime-Audit unvollständig: ${missing} fehlt.` : null;
}

/** Running-stack postcondition. Does not read files, resolve DNS, or mutate runtime state. */
export async function auditRuntimePostcondition(
  request: RuntimePostcondition,
  compose: ComposeStatus | null,
  hooks: {
    auditListeners?: typeof auditRestrictedListeners;
    auditBindings?: typeof auditStaffPublishedBindings;
  } = {},
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const bindingError = runtimeBindingError(request, compose, hooks.auditBindings);
  if (bindingError) errors.push(`Runtime-Binding ungültig: ${bindingError}`);
  if (request.restrictedEnabled) {
    if (
      !request.bindings.proxyEnabled ||
      !request.bindings.proxyHttpsEnabled ||
      !request.listeners
    ) {
      errors.push('Listeneraudit: Restricted-Identität, HTTPS-Proxy oder Vertrag fehlt.');
    } else if (errors.length === 0) {
      try {
        const error = await (hooks.auditListeners ?? auditRestrictedListeners)(request.listeners);
        if (error) errors.push(`Listener-Prüfung fehlgeschlagen: ${error}`);
      } catch (error) {
        errors.push(
          `Listener-Prüfung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
