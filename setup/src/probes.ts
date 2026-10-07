import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Resolver } from 'node:dns/promises';

import type { ProbeResult } from '@wartezimmer/server-shared';

export type { ProbeResult } from '@wartezimmer/server-shared';

export type FetchStatusFn = (url: string) => Promise<{ ok: boolean; status: number; body: string }>;
export type DnsRebindDetector = (hostname: string) => Promise<boolean>;

function isPrivateIpv4(ip: string): boolean {
  if (net.isIP(ip) !== 4) return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

export async function defaultDetectDnsRebind(
  hostname: string,
  deps?: {
    createResolver?: () => Pick<Resolver, 'setServers' | 'resolve4' | 'cancel'>;
    timeoutMs?: number;
  },
): Promise<boolean> {
  if (net.isIP(hostname)) return false;
  const timeoutMs = deps?.timeoutMs ?? 1500;
  const resolvers: Array<Pick<Resolver, 'setServers' | 'resolve4' | 'cancel'>> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Query both independently: NXDOMAIN from one must not hide the other's
    // answer. Bound the entire diagnostic, not each server/retry separately.
    const queries = ['1.1.1.1', '8.8.8.8'].map(async (server) => {
      const resolver = deps?.createResolver?.() ?? new Resolver({ timeout: timeoutMs, tries: 1 });
      resolvers.push(resolver);
      resolver.setServers([server]);
      const addresses = await resolver.resolve4(hostname);
      if (!addresses.some(isPrivateIpv4)) throw new Error('No private A record');
      return true;
    });
    return await Promise.race([
      Promise.any(queries).catch(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    for (const resolver of resolvers) resolver.cancel();
  }
}

function fetchStatus(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid url';
      resolve({ ok: false, status: 0, body: message });
      return;
    }

    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        timeout: 2_000,
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += String(chunk);
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            body,
          });
        });
      },
    );

    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, status: 0, body: 'timeout' });
    });
    request.on('error', (error) => {
      resolve({ ok: false, status: 0, body: error.message });
    });
    request.end();
  });
}

export async function runConnectionProbes(
  input: {
    localAppBaseUrl?: string;
    lanAppBaseUrl?: string;
  },
  deps?: {
    fetchStatus?: FetchStatusFn;
    detectDnsRebind?: DnsRebindDetector;
  },
): Promise<ProbeResult[]> {
  const doFetch = deps?.fetchStatus ?? fetchStatus;
  const doDetectRebind = deps?.detectDnsRebind ?? defaultDetectDnsRebind;

  const localBase = (input.localAppBaseUrl ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
  const localHealthUrl = `${localBase}/api/v1/ops/health`;
  const lanBase = input.lanAppBaseUrl?.trim().replace(/\/$/, '');

  const localHealthPromise = doFetch(localHealthUrl);
  const lanHealthPromise = lanBase
    ? doFetch(`${lanBase}/api/v1/ops/health`)
    : Promise.resolve(null);

  const [localHealth, lanHealth] = await Promise.all([localHealthPromise, lanHealthPromise]);

  const results: ProbeResult[] = [
    {
      id: 'app.health.local',
      ok: localHealth.ok && localHealth.status === 200,
      message: localHealth.ok ? 'API lokal erreichbar' : 'API lokal nicht erreichbar',
      detail: localHealth.status ? `HTTP ${localHealth.status}` : localHealth.body,
    },
  ];

  if (lanBase && lanHealth) {
    let rebind = false;
    if (
      !lanHealth.ok &&
      lanHealth.status === 0 &&
      /\b(?:ENOTFOUND|EAI_AGAIN)\b/.test(lanHealth.body)
    ) {
      try {
        const lanHostname = new URL(lanBase).hostname;
        rebind = await doDetectRebind(lanHostname);
      } catch {
        // invalid URL
      }
    }

    results.push({
      id: 'app.health.lan',
      ok: lanHealth.ok && lanHealth.status === 200,
      message: lanHealth.ok
        ? 'API im LAN erreichbar'
        : rebind
          ? 'DNS-Rebind-Schutz oder lokaler DNS-Filter möglich'
          : 'Geräte kommen nicht an',
      detail: lanHealth.status ? `HTTP ${lanHealth.status}` : lanHealth.body,
      reason: rebind ? 'dns-rebind' : undefined,
    });
  }

  return results;
}
