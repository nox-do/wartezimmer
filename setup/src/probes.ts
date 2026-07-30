import http from 'node:http';
import https from 'node:https';

import type { ProbeResult } from '@praxis-flow/server-shared';

export type { ProbeResult } from '@praxis-flow/server-shared';

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

export async function runConnectionProbes(input: {
  localAppBaseUrl?: string;
  lanAppBaseUrl?: string;
}): Promise<ProbeResult[]> {
  const localBase = (input.localAppBaseUrl ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
  const localHealthUrl = `${localBase}/api/v1/ops/health`;
  const lanBase = input.lanAppBaseUrl?.trim().replace(/\/$/, '');

  const localHealthPromise = fetchStatus(localHealthUrl);
  const lanHealthPromise = lanBase
    ? fetchStatus(`${lanBase}/api/v1/ops/health`)
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
    results.push({
      id: 'app.health.lan',
      ok: lanHealth.ok && lanHealth.status === 200,
      message: lanHealth.ok ? 'API im LAN erreichbar' : 'Geräte kommen nicht an',
      detail: lanHealth.status ? `HTTP ${lanHealth.status}` : lanHealth.body,
    });
  }

  return results;
}
