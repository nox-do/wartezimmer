import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TlsCertificateStatus } from '@praxis-flow/server-shared';
import { readEnvMap } from './env-file.js';
import {
  applyHostTls,
  checkCustomCertificate,
  emptyTlsStatus,
  obtainManagedCertificate,
  prepareHostTls,
  readTlsStatus,
  repairHostTls,
  resetHostTls,
  stageCustomCertificate,
  transitionTlsStatus,
  verifyHostTlsDns,
} from './host-tls.js';
import {
  GENERATED_CADDYFILE_MARKER,
  generateTlsCaddyfile,
  resolveProxyTlsPaths,
} from './proxy-tls.js';
import { testSetupContext } from './test-setup-context.js';

const certificate: TlsCertificateStatus = {
  issuer: "Let's Encrypt",
  notBefore: '2026-08-28T00:00:00.000Z',
  notAfter: '2026-11-26T00:00:00.000Z',
  names: ['7fk3m2.lan.notaus.de'],
};

function writeEnv(root: string, entries: Record<string, string>) {
  fs.writeFileSync(
    path.join(root, '.env'),
    `${Object.entries(entries)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  );
}

async function withRoot(run: (root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-host-tls-'));
  try {
    await run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('TLS state graph keeps certificate-ready separate from apply', () => {
  let status = transitionTlsStatus(emptyTlsStatus(), {
    type: 'prepare-started',
    mode: 'managed',
    hostname: '7fk3m2.lan.notaus.de',
    installationId: '7fk3m2q9',
  });
  assert.equal(status.state, 'preparing');
  status = transitionTlsStatus(status, { type: 'prepared' });
  status = transitionTlsStatus(status, { type: 'dns-verified' });
  status = transitionTlsStatus(status, { type: 'certificate-started' });
  status = transitionTlsStatus(status, { type: 'certificate-ready', certificate });
  assert.equal(status.state, 'dns-verified');
  assert.equal(status.applyReady, true);
  assert.equal(status.cutoverApplied, false);
  status = transitionTlsStatus(status, { type: 'apply' });
  assert.equal(status.state, 'active');
  assert.equal(status.cutoverApplied, true);
});

test('readTlsStatus does not expose token or PEM-shaped env keys', () => {
  const status = readTlsStatus(
    new Map([
      ['TLS_STATE', 'awaiting-operator-dns'],
      ['TLS_MODE', 'managed'],
      ['TLS_HOSTNAME', '7fk3m2.lan.notaus.de'],
      ['TLS_INSTALLATION_ID', '7fk3m2q9'],
      ['TLS_OPERATOR_TOKEN', 'secret'],
      ['TLS_PRIVATE_KEY', 'secret-pem'],
    ]),
  );
  assert.deepEqual(Object.keys(status).sort(), [
    'applyReady',
    'certificate',
    'cutoverApplied',
    'hostname',
    'installationId',
    'lastError',
    'mode',
    'state',
    'tokenConsumed',
  ]);
  assert.equal(JSON.stringify(status).includes('secret'), false);
});

test('managed fake vertical slice stays HTTP until apply and consumes token after obtain', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      PROXY_HTTP_PORT: '80',
      APP_BIND_ADDRESS: '127.0.0.1',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    const deps = {
      randomBytes: ((size: number) =>
        Buffer.alloc(size, 2)) as typeof import('node:crypto').randomBytes,
      registerAcmeDns: async () => ({
        username: 'account',
        password: 'password',
        subdomain: 'challenge-id',
        fulldomain: 'challenge-id.auth.acme-dns.io',
        serverUrl: 'https://auth.acme-dns.io',
      }),
    };

    const prepared = await prepareHostTls(
      ctx,
      {
        mode: 'managed',
        hostname: '7fk3m2.lan.notaus.de',
        lanIp: '192.168.178.112',
      },
      deps,
    );
    assert.equal(prepared.tls.state, 'awaiting-operator-dns');
    assert.ok(prepared.operatorRequest?.oneTimeToken);
    assert.equal(readEnvMap(path.join(root, '.env')).get('PROXY_MODE'), 'http');

    const verified = await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({
        aRecords: ['192.168.178.112'],
        cnameRecords: ['challenge-id.auth.acme-dns.io'],
      }),
    });
    assert.equal(verified.tls.state, 'dns-verified');
    assert.equal(verified.checks.length, 3);

    const obtained = await obtainManagedCertificate(ctx);
    assert.equal(obtained.tls.state, 'dns-verified');
    assert.equal(obtained.tls.applyReady, true);
    assert.equal(obtained.tls.tokenConsumed, true);
    assert.equal(fs.existsSync(resolveProxyTlsPaths(root).operatorToken), false);
    assert.equal(readEnvMap(path.join(root, '.env')).get('PROXY_MODE'), 'http');

    const applied = await applyHostTls(ctx);
    assert.equal(applied.tls.state, 'active');
    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('PROXY_MODE'), 'tls-managed');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'https://7fk3m2.lan.notaus.de');
    assert.equal(env.get('TRUST_PROXY_HEADERS'), 'true');
    const caddyfile = fs.readFileSync(resolveProxyTlsPaths(root).caddyfile, 'utf8');
    assert.match(caddyfile, /redir https:\/\/7fk3m2\.lan\.notaus\.de\{uri\} permanent/);
  });
});

test('custom verify-dns checks only the A record', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(ctx, {
      mode: 'custom',
      hostname: 'flow.praxis-meyer.de',
      lanIp: '192.168.178.112',
    });
    const result = await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({ aRecords: ['192.168.178.112'], cnameRecords: [] }),
    });
    assert.deepEqual(
      result.checks.map((check) => check.id),
      ['server-ipv4', 'a-record'],
    );
  });
});

test('custom PEM is staged inactive and becomes applyReady only after local checks', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(ctx, {
      mode: 'custom',
      hostname: 'flow.praxis-meyer.de',
      lanIp: '192.168.178.112',
    });
    const certPath = path.join(root, 'fixture-cert.pem');
    const keyPath = path.join(root, 'fixture-key.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=flow.praxis-meyer.de',
        '-addext',
        'subjectAltName=DNS:flow.praxis-meyer.de',
        '-days',
        '2',
        '-keyout',
        keyPath,
        '-out',
        certPath,
      ],
      { stdio: 'ignore' },
    );
    const staged = stageCustomCertificate(ctx, {
      fullchainPem: fs.readFileSync(certPath, 'utf8'),
      privateKeyPem: fs.readFileSync(keyPath, 'utf8'),
    });
    assert.equal(staged.tls.state, 'awaiting-operator-dns');
    assert.equal(staged.tls.applyReady, false);
    assert.equal(readEnvMap(path.join(root, '.env')).get('PROXY_MODE'), 'http');

    await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({ aRecords: ['192.168.178.112'], cnameRecords: [] }),
    });
    const checked = await checkCustomCertificate(ctx);
    assert.equal(checked.tls.state, 'dns-verified');
    assert.equal(checked.tls.applyReady, true);
    assert.equal(readEnvMap(path.join(root, '.env')).get('PROXY_MODE'), 'http');
  });
});

test('DNS failure persists error class and repair returns to the retry state', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(ctx, {
      mode: 'custom',
      hostname: 'flow.praxis-meyer.de',
      lanIp: '192.168.178.112',
    });
    const failed = await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({ aRecords: ['192.168.178.99'], cnameRecords: [] }),
    });
    assert.equal(failed.tls.state, 'error');
    assert.equal(failed.tls.lastError?.class, 'collision');
    const repaired = await repairHostTls(ctx);
    assert.equal(repaired.tls.state, 'awaiting-operator-dns');
    assert.equal(repaired.tls.lastError, null);
  });
});

test('reset before cutover removes persisted identity and secret files', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(ctx, {
      mode: 'custom',
      hostname: 'flow.praxis-meyer.de',
      lanIp: '192.168.178.112',
    });
    const result = await resetHostTls(ctx);
    assert.equal(result.tls.state, 'off');
    assert.equal(readEnvMap(path.join(root, '.env')).has('TLS_STATE'), false);
    assert.equal(fs.existsSync(resolveProxyTlsPaths(root).root), false);
  });
});

test('generated Caddyfile keeps HTTP app before cutover and uses ACME-DNS without secrets', () => {
  const status = {
    ...emptyTlsStatus(),
    state: 'dns-verified' as const,
    mode: 'managed' as const,
    hostname: '7fk3m2.lan.notaus.de',
    installationId: '7fk3m2q9',
  };
  const caddyfile = generateTlsCaddyfile(status, new Map());
  assert.match(caddyfile, new RegExp(GENERATED_CADDYFILE_MARKER));
  assert.match(caddyfile, /:80 \{\n\treverse_proxy app:8080/);
  assert.match(caddyfile, /dns acmedns \/run\/secrets\/acme-dns\.json/);
  assert.match(caddyfile, /disable_http_challenge/);
  assert.match(caddyfile, /disable_tlsalpn_challenge/);
  assert.doesNotMatch(caddyfile, /password|oneTimeToken/);
});
