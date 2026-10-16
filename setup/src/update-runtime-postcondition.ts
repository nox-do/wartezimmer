import { auditRuntimePostcondition } from './runtime-postcondition.js';
import { requestRestrictedHttps } from './restricted-listener-probe.js';
import { fetchStatus } from './probes.js';

/** Update-only policy: prove the local proxy path without depending on device DNS.
 * Restore and TLS retain their existing acceptance criteria.
 */
export async function auditUpdateRuntimePostcondition(
  request: Parameters<typeof auditRuntimePostcondition>[0],
  compose: Parameters<typeof auditRuntimePostcondition>[1],
  hooks: Parameters<typeof auditRuntimePostcondition>[2] & {
    httpsProbe?: typeof requestRestrictedHttps;
    httpProbe?: typeof fetchStatus;
  } = {},
): Promise<{ ok: boolean; errors: string[] }> {
  const result = await auditRuntimePostcondition(request, compose, hooks);
  // Restricted audit already proves both local HTTPS listeners and their isolation.
  if (!result.ok || request.restrictedEnabled || !request.bindings.proxyEnabled) return result;
  const { staffIp, proxyHttpsEnabled, proxyHttpsPort, proxyHttpPort } = request.bindings;
  if (!staffIp || (proxyHttpsEnabled && !request.staffHostname))
    return { ok: false, errors: ['Lokale Proxy-Prüfung: Praxis-IP oder HTTPS-Hostname fehlt.'] };
  try {
    const endpoint = '/api/v1/ops/health';
    const response = proxyHttpsEnabled
      ? await (hooks.httpsProbe ?? requestRestrictedHttps)(
          staffIp,
          request.staffHostname!,
          endpoint,
          {
            port: proxyHttpsPort,
          },
        )
      : await (hooks.httpProbe ?? fetchStatus)(`http://${staffIp}:${proxyHttpPort}${endpoint}`);
    if (response.status !== 200 || ('error' in response && response.error))
      return {
        ok: false,
        errors: [
          'Lokale Proxy-Prüfung fehlgeschlagen: ' +
            ('error' in response
              ? response.error || `HTTP ${response.status}`
              : `HTTP ${response.status}`),
        ],
      };
    return result;
  } catch (error) {
    return {
      ok: false,
      errors: [
        `Lokale Proxy-Prüfung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}
