import { restrictedDiagnostic } from './restricted-diagnostics.js';
import https from 'node:https';
import fs from 'node:fs';
import {
  DEFAULT_PORTAL_PROXY_CONTRACT,
  type PortalProxyContract,
} from '@praxis-flow/server-shared';

export type RestrictedHttpsProbeResult = {
  status: number | null;
  error: string | null;
  rejection?: string;
  transport?: 'rejected' | 'failed';
};

export type RestrictedHttpsProbe = (
  targetIp: string,
  serverName: string,
  path: string,
  options?: { host?: string; method?: string; negative?: boolean; port?: number },
) => Promise<RestrictedHttpsProbeResult>;

export function requestRestrictedHttps(
  targetIp: string,
  serverName: string,
  path: string,
  options?: { host?: string; method?: string; negative?: boolean; port?: number },
): Promise<RestrictedHttpsProbeResult> {
  return new Promise((resolve) => {
    let ca: Buffer | undefined;
    const testCaPath = process.env.TLS_PEBBLE_ROOT_CA_PATH?.trim();
    if (testCaPath) {
      try {
        ca = fs.readFileSync(testCaPath);
      } catch (error) {
        resolve({
          status: null,
          error: `Test-CA konnte nicht gelesen werden: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }
    }
    let responseStatus: number | null = null;
    const request = https.request(
      {
        host: targetIp,
        agent: false,
        port: options?.port ?? 443,
        servername: serverName,
        path,
        method: options?.method ?? 'GET',
        headers: { host: options?.host ?? serverName },
        // Negative probes must reach server-side rejection even for unknown SNI.
        // Positive probes still verify certificate identity and trust.
        rejectUnauthorized: !options?.negative,
        ...(ca ? { ca } : {}),
        timeout: 3_000,
      },
      (response) => {
        responseStatus = response.statusCode ?? null;
        response.on('aborted', () =>
          resolve({ status: responseStatus, error: 'response aborted', transport: 'failed' }),
        );
        response.on('error', (error) =>
          resolve({ status: responseStatus, error: error.message, transport: 'failed' }),
        );
        response.resume();
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? null,
            error: null,
            rejection: String(response.headers['x-praxis-flow-rejection'] ?? ''),
          }),
        );
      },
    );
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error: NodeJS.ErrnoException) =>
      resolve({
        status: responseStatus,
        error: error.message,
        transport:
          error.code === 'ECONNRESET' ||
          error.code?.startsWith('ERR_SSL_TLSV1_ALERT_') ||
          error.code === 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE' ||
          (error.code === 'EPROTO' && /SSL alert number (?:40|80|112)\b/.test(error.message))
            ? 'rejected'
            : 'failed',
      }),
    );
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
    staffHttpsPort?: number;
    portalHostname: string;
    contract?: PortalProxyContract;
  },
  probe: RestrictedHttpsProbe = requestRestrictedHttps,
): Promise<string | null> {
  const contract = input.contract ?? DEFAULT_PORTAL_PROXY_CONTRACT;
  const installationDomain = input.portalHostname.split('.').slice(1).join('.');
  const unknownHostname = `unbekannt.${installationDomain}`;
  const cases: {
    ip: string;
    sni: string;
    host: string;
    path: string;
    method: string;
    expected: 'ok' | 'abort' | 'policy';
    label: string;
  }[] = [
    {
      ip: input.staffIp,
      sni: input.staffHostname,
      host: input.staffHostname,
      path: '/',
      method: 'GET',
      expected: 'ok',
      label: 'Staff auf Staff-IP',
    },
    {
      ip: input.restrictedIp,
      sni: input.portalHostname,
      host: input.portalHostname,
      path: '/portal',
      method: 'GET',
      expected: 'ok',
      label: 'Portal auf Restricted-IP',
    },
  ];
  for (const route of contract.ui) {
    for (const method of route.methods) {
      if (route.path === '/portal' && method === 'GET') continue;
      cases.push({
        ip: input.restrictedIp,
        sni: input.portalHostname,
        host: input.portalHostname,
        path: route.path,
        method,
        expected: 'ok',
        label: `${method} ${route.path}`,
      });
    }
  }
  for (const [ip, intended, crossed] of [
    [input.staffIp, input.staffHostname, input.portalHostname],
    [input.restrictedIp, input.portalHostname, input.staffHostname],
  ]) {
    for (const [sni, host] of [
      [crossed!, crossed!],
      [unknownHostname, unknownHostname],
      ['unknown.invalid', 'unknown.invalid'],
      [intended!, unknownHostname],
      [unknownHostname, intended!],
      ['', intended!],
      [intended!, crossed!],
      [crossed!, intended!],
    ])
      cases.push({
        ip: ip!,
        sni,
        host,
        path: '/portal',
        method: 'GET',
        expected: 'abort',
        label: `Host/SNI auf ${ip}: ${host} / ${sni || '(ohne SNI)'}`,
      });
  }
  const denied = [
    { method: 'GET', path: '/mfa' },
    { method: 'GET', path: '/ops' },
    { method: 'GET', path: '/api/not-allowed' },
    { method: 'GET', path: '/api/v1/queue' },
    ...contract.internal,
    // Only forbidden methods are sent to the real installation; no writes.
    ...contract.api.flatMap((route) =>
      ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
        .filter(
          (method) =>
            !contract.api.some(
              (candidate) => candidate.path === route.path && candidate.method === method,
            ),
        )
        .map((method) => ({ method, path: route.path.replace(/:[^/]+/g, 'audit-nonexistent') })),
    ),
  ];
  for (const route of denied)
    cases.push({
      ip: input.restrictedIp,
      sni: input.portalHostname,
      host: input.portalHostname,
      ...route,
      expected: 'policy',
      label: `${route.method} ${route.path}`,
    });
  const results = await Promise.all(
    cases.map((c) =>
      probe(c.ip, c.sni, c.path, {
        host: c.host,
        method: c.method,
        negative: c.expected === 'abort',
        port: c.ip === input.staffIp ? (input.staffHttpsPort ?? 443) : 443,
      }),
    ),
  );
  const failures = cases.flatMap((c, index) => {
    const result = results[index]!;
    const ok =
      c.expected === 'ok'
        ? accepted(result)
        : c.expected === 'abort'
          ? result.status === null && result.transport === 'rejected'
          : result.status === 404 && result.rejection === 'portal-policy';
    restrictedDiagnostic('listener.probe', {
      targetIp: c.ip,
      sni: c.sni,
      host: c.host,
      method: c.method,
      path: c.path,
      port: c.ip === input.staffIp ? (input.staffHttpsPort ?? 443) : 443,
      expected: c.expected,
      ok,
      status: result.status,
      transport: result.transport ?? null,
      rejection: result.rejection === 'portal-policy' ? 'portal-policy' : null,
    });
    return ok
      ? []
      : [`${c.label}: erwartete ${c.expected}-Grenze nicht nachgewiesen (${describe(result)})`];
  });
  return failures.length ? failures.join('; ') : null;
}
