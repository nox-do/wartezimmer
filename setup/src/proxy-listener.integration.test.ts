import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import test from 'node:test';
import { DEFAULT_PORTAL_PROXY_CONTRACT, type TlsStatus } from '@wartezimmer/server-shared';
import { generateTlsCaddyfile } from './proxy-tls.js';
import { auditRestrictedListeners, requestRestrictedHttps } from './restricted-listener-probe.js';

// Explicit opt-in: starts only an isolated disposable container, never the installation.
test(
  'real Caddy enforces listener, Host/SNI and portal method boundaries',
  { skip: process.env.TEST_CADDY_INTEGRATION !== 'true' },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-caddy-audit-'));
    const name = `pf-caddy-audit-${process.pid}`;
    const docker = (...args: string[]) =>
      execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const previousCa = process.env.TLS_PEBBLE_ROOT_CA_PATH;
    const contract = structuredClone(DEFAULT_PORTAL_PROXY_CONTRACT);
    const former = contract.api.find((route) => route.path.endsWith('/config'))!;
    contract.api = [
      ...contract.api.filter((route) => route !== former),
      { method: 'GET', path: '/api/v1/portal/release-check' },
    ];
    contract.internal = [...contract.internal, former];
    const status = {
      mode: 'custom',
      hostname: 'staff.audit.example',
      staffHostname: 'staff.audit.example',
      portalHostname: 'portal.audit.example',
      cutoverApplied: true,
    } as TlsStatus;
    try {
      fs.writeFileSync(
        path.join(root, 'openssl.cnf'),
        '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=*.audit.example\n[ext]\nsubjectAltName=DNS:*.audit.example\nbasicConstraints=critical,CA:TRUE\n',
      );
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-config',
          path.join(root, 'openssl.cnf'),
          '-keyout',
          path.join(root, 'private-key.pem'),
          '-out',
          path.join(root, 'fullchain.pem'),
        ],
        { stdio: 'ignore' },
      );
      const config =
        generateTlsCaddyfile(
          status,
          new Map([['SETUP_RESTRICTED_ENABLED', 'true']]),
          contract,
        ).replaceAll('app:8080', '127.0.0.1:8080') +
        '\n:8080 {\n header X-Wartezimmer-Rejection portal-policy\n respond "upstream" 200\n}\n';
      fs.writeFileSync(path.join(root, 'Caddyfile'), config);
      docker(
        'run',
        '--rm',
        '-v',
        `${root}:/certs:ro`,
        'caddy:2.11.4',
        'caddy',
        'validate',
        '--config',
        '/certs/Caddyfile',
        '--adapter',
        'caddyfile',
      );
      docker(
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-p',
        '127.0.0.1::443',
        '-p',
        '127.0.0.1::444',
        '-p',
        '127.0.0.1::80',
        '-v',
        `${root}:/certs:ro`,
        'caddy:2.11.4',
        'caddy',
        'run',
        '--config',
        '/certs/Caddyfile',
        '--adapter',
        'caddyfile',
      );
      const ports = JSON.parse(
        docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', name),
      );
      const port = (n: number) => Number(ports[`${n}/tcp`][0].HostPort);
      process.env.TLS_PEBBLE_ROOT_CA_PATH = path.join(root, 'fullchain.pem');
      for (let attempt = 0; attempt < 30; attempt++) {
        const ready = await requestRestrictedHttps('127.0.0.1', status.staffHostname!, '/', {
          port: port(443),
        });
        if (ready.status === 200) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        await auditRestrictedListeners(
          {
            staffIp: 'staff',
            restrictedIp: 'portal',
            staffHostname: status.staffHostname!,
            portalHostname: status.portalHostname!,
            contract,
          },
          (ip, sni, url, options) =>
            requestRestrictedHttps('127.0.0.1', sni, url, {
              ...options,
              port: port(ip === 'staff' ? 443 : 444),
            }),
        ),
        null,
      );
      for (const route of contract.api) {
        const result = await requestRestrictedHttps(
          '127.0.0.1',
          status.portalHostname!,
          route.path.replace(/:[^/]+/g, 'fixture'),
          { method: route.method, port: port(444) },
        );
        assert.equal(result.status, 200, `${route.method} ${route.path}`);
        assert.equal(result.rejection, '', 'upstream cannot impersonate a proxy rejection');
      }
      assert.equal(
        (
          await requestRestrictedHttps('127.0.0.1', status.staffHostname!, '/portal', {
            port: port(443),
          })
        ).status,
        200,
      );
      for (const host of [status.staffHostname!, status.portalHostname!, 'evil.example']) {
        const result = await new Promise<number | string>((resolve) => {
          const req = http.get(
            { host: '127.0.0.1', port: port(80), headers: { host }, timeout: 3000 },
            (res) => {
              res.resume();
              res.on('end', () => resolve(res.statusCode!));
            },
          );
          req.on('error', (err: NodeJS.ErrnoException) => resolve(err.code ?? 'error'));
          req.on('timeout', () => req.destroy(new Error('timeout')));
        });
        assert.equal(result, host === status.staffHostname ? 301 : 'ECONNRESET');
      }

      const removedConfig =
        generateTlsCaddyfile(status, new Map()).replaceAll('app:8080', '127.0.0.1:8080') +
        '\n:8080 {\n respond "upstream" 200\n}\n';
      fs.writeFileSync(path.join(root, 'Caddyfile'), removedConfig);
      docker(
        'exec',
        name,
        'caddy',
        'reload',
        '--config',
        '/certs/Caddyfile',
        '--adapter',
        'caddyfile',
      );
      const adapted = JSON.parse(
        docker(
          'exec',
          name,
          'caddy',
          'adapt',
          '--config',
          '/certs/Caddyfile',
          '--adapter',
          'caddyfile',
        ),
      );
      const listeners = Object.values(
        adapted.apps.http.servers as Record<string, { listen: string[] }>,
      ).flatMap((server) => server.listen);
      assert.equal(
        listeners.some((listener) => listener.endsWith(':444')),
        false,
      );
      assert.equal(
        (
          await requestRestrictedHttps('127.0.0.1', status.staffHostname!, '/portal', {
            port: port(443),
          })
        ).status,
        200,
      );
    } finally {
      try {
        docker('rm', '-f', name);
      } catch {
        /* container may not have started */
      }
      if (previousCa === undefined) delete process.env.TLS_PEBBLE_ROOT_CA_PATH;
      else process.env.TLS_PEBBLE_ROOT_CA_PATH = previousCa;
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
