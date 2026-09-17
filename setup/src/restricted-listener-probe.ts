import https from 'node:https';

export type RestrictedHttpsProbeResult = {
  status: number | null;
  error: string | null;
};

export type RestrictedHttpsProbe = (
  targetIp: string,
  serverName: string,
  path: string,
) => Promise<RestrictedHttpsProbeResult>;

export function requestRestrictedHttps(
  targetIp: string,
  serverName: string,
  path: string,
): Promise<RestrictedHttpsProbeResult> {
  return new Promise((resolve) => {
    const request = https.request(
      {
        host: targetIp,
        port: 443,
        servername: serverName,
        path,
        method: 'GET',
        headers: { host: serverName },
        rejectUnauthorized: false,
        timeout: 3_000,
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve({ status: response.statusCode ?? null, error: null }));
      },
    );
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => resolve({ status: null, error: error.message }));
    request.end();
  });
}

function accepted(result: RestrictedHttpsProbeResult): boolean {
  return result.status !== null && result.status >= 200 && result.status < 400;
}

function describe(result: RestrictedHttpsProbeResult): string {
  return result.status !== null ? `HTTP ${result.status}` : result.error || 'keine Antwort';
}

export async function auditRestrictedListeners(
  input: {
    staffIp: string;
    restrictedIp: string;
    staffHostname: string;
    portalHostname: string;
  },
  probe: RestrictedHttpsProbe = requestRestrictedHttps,
): Promise<string | null> {
  const installationDomain = input.portalHostname.split('.').slice(1).join('.');
  const unknownHostname = `unbekannt.${installationDomain}`;
  const checks = await Promise.all([
    probe(input.staffIp, input.staffHostname, '/'),
    probe(input.restrictedIp, input.portalHostname, '/portal'),
    probe(input.restrictedIp, input.staffHostname, '/'),
    probe(input.staffIp, input.portalHostname, '/portal'),
    probe(input.restrictedIp, unknownHostname, '/'),
    probe(input.staffIp, unknownHostname, '/'),
  ]);
  const failures = [
    !accepted(checks[0]!) && `Staff auf Staff-IP nicht erreichbar (${describe(checks[0]!)})`,
    !accepted(checks[1]!) && `Portal auf Restricted-IP nicht erreichbar (${describe(checks[1]!)})`,
    accepted(checks[2]!) && 'Staff-Hostname wird auf der Restricted-IP akzeptiert',
    accepted(checks[3]!) && 'Portal-Hostname wird auf der Staff-IP akzeptiert',
    accepted(checks[4]!) && 'Unbekanntes SNI wird auf der Restricted-IP akzeptiert',
    accepted(checks[5]!) && 'Unbekanntes SNI wird auf der Staff-IP akzeptiert',
  ].filter((failure): failure is string => Boolean(failure));
  return failures.length ? failures.join('; ') : null;
}
