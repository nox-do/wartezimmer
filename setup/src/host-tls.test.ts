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
  dnsAddressSetsEqual,
  emptyTlsStatus,
  obtainManagedCertificate,
  parseTlsDnsResolvers,
  parentDnsName,
  pebbleLocalCheckCa,
  planProxyReloadAfterUp,
  isRetryableLocalCheckError,
  prepareHostTls,
  readTlsStatus,
  resetHostTls,
  stageCustomCertificate,
  TlsPermanentCheckError,
  TLS_DNS_RESOLVERS_DEFAULT,
  transitionTlsStatus,
  verifyHostTlsDns,
  wildcardProbeHostname,
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
    'acmeCnameTarget',
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

test('readTlsStatus treats a pre-cutover DNS miss as still waiting', () => {
  const status = readTlsStatus(
    new Map([
      ['TLS_STATE', 'error'],
      ['TLS_MODE', 'managed'],
      ['TLS_HOSTNAME', 'mudda.lan.notaus.de'],
      ['TLS_LAST_ERROR_CLASS', 'a-record'],
      [
        'TLS_LAST_ERROR_MESSAGE',
        'Kein eigener A-Record — Catch-all der Zone zeigt auf 213.23.215.150',
      ],
    ]),
  );
  assert.equal(status.state, 'awaiting-operator-dns');
  assert.equal(status.lastError, null);
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

test('apply rolls back Canonical and Caddyfile when proxy reload fails', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      managedDeps,
    );
    await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({
        aRecords: ['192.168.178.112'],
        cnameRecords: ['challenge-id.auth.acme-dns.io'],
      }),
    });
    await obtainManagedCertificate(ctx, {
      reloadProxy: async () => undefined,
      runLocalChecks: async () => greenLocal,
    });
    await assert.rejects(
      () =>
        applyHostTls(ctx, {
          reloadProxy: async () => {
            throw new Error('Caddy konnte nicht neu geladen werden.');
          },
        }),
      /Caddy konnte nicht neu geladen werden/,
    );
    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('PROXY_MODE'), 'http');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'http://192.168.178.112');
    assert.equal(env.get('TLS_STATE'), 'dns-verified');
    assert.equal(env.get('TLS_APPLY_READY'), 'true');
    assert.equal(env.get('TLS_CUTOVER_APPLIED'), 'false');
    assert.equal(env.get('TLS_LAST_ERROR_CLASS'), 'firewall');
    const caddyfile = fs.readFileSync(resolveProxyTlsPaths(root).caddyfile, 'utf8');
    assert.match(caddyfile, /reverse_proxy app:8080/);
    assert.doesNotMatch(caddyfile, /redir https:/);
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

test('DNS miss stays waiting for operator DNS', async () => {
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
    assert.equal(failed.tls.state, 'awaiting-operator-dns');
    assert.equal(failed.tls.lastError, null);
    assert.match(
      failed.checks.find((check) => check.id === 'a-record')?.message ?? '',
      /192\.168\.178\.99/,
    );
    assert.equal(readEnvMap(path.join(root, '.env')).get('TLS_STATE'), 'awaiting-operator-dns');
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
  assert.doesNotMatch(caddyfile, /resolvers coredns/);
});

test('generated Caddyfile uses CoreDNS resolvers only in pebble directory mode', () => {
  const status = {
    ...emptyTlsStatus(),
    state: 'dns-verified' as const,
    mode: 'managed' as const,
    hostname: 'labhost.lan.tls.lab',
    installationId: 'labhostid',
  };
  const caddyfile = generateTlsCaddyfile(status, new Map([['TLS_ACME_DIRECTORY', 'pebble']]));
  assert.match(caddyfile, /dir https:\/\/pebble:14000\/dir/);
  assert.match(caddyfile, /resolvers coredns:53/);
});

test('parseTlsDnsResolvers uses public defaults when unset', () => {
  assert.deepEqual(parseTlsDnsResolvers(undefined), [...TLS_DNS_RESOLVERS_DEFAULT]);
  assert.deepEqual(parseTlsDnsResolvers(''), [...TLS_DNS_RESOLVERS_DEFAULT]);
  assert.deepEqual(parseTlsDnsResolvers('  '), [...TLS_DNS_RESOLVERS_DEFAULT]);
});

test('parseTlsDnsResolvers accepts lab and comma-separated resolvers uniquely', () => {
  assert.deepEqual(parseTlsDnsResolvers('127.0.0.1:9053'), ['127.0.0.1:9053']);
  assert.deepEqual(parseTlsDnsResolvers('1.1.1.1, 8.8.8.8,1.1.1.1'), ['1.1.1.1', '8.8.8.8']);
});

test('parseTlsDnsResolvers rejects invalid entries', () => {
  assert.throws(() => parseTlsDnsResolvers('one.one.one.one'), /ungültigen Eintrag/);
  assert.throws(() => parseTlsDnsResolvers('127.0.0.1:99999'), /ungültigen Port/);
});

test('wildcard probe uses the RFC wildcard label under the same parent', () => {
  assert.equal(parentDnsName('mudda.lan.notaus.de'), 'lan.notaus.de');
  assert.equal(wildcardProbeHostname('mudda.lan.notaus.de'), '*.lan.notaus.de');
  assert.equal(wildcardProbeHostname('localhost'), null);
  assert.equal(dnsAddressSetsEqual(['213.23.215.150'], ['213.23.215.150']), true);
  assert.equal(dnsAddressSetsEqual(['213.23.215.150'], ['192.168.1.18']), false);
});

const managedDeps = {
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

test('verify-dns uses public resolvers by default and lab resolvers when set', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      managedDeps,
    );
    let servers: string[] = [];
    const verified = await verifyHostTlsDns(ctx, {
      createDnsResolver: () => ({
        setServers: (value) => {
          servers = value;
        },
        resolve4: async () => ['192.168.178.112'],
        resolveCname: async () => ['challenge-id.auth.acme-dns.io'],
      }),
    });
    assert.deepEqual(servers, [...TLS_DNS_RESOLVERS_DEFAULT]);
    assert.equal(verified.tls.state, 'dns-verified');

    await resetHostTls(ctx);
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
      TLS_DNS_RESOLVERS: '127.0.0.1:9053',
    });
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      managedDeps,
    );
    servers = [];
    await verifyHostTlsDns(ctx, {
      createDnsResolver: () => ({
        setServers: (value) => {
          servers = value;
        },
        resolve4: async () => ['192.168.178.112'],
        resolveCname: async () => ['challenge-id.auth.acme-dns.io'],
      }),
    });
    assert.deepEqual(servers, ['127.0.0.1:9053']);
  });
});

test('verify-dns treats identical sibling A answers as a zone catch-all', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.1.18',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: 'mudda.lan.notaus.de', lanIp: '192.168.1.18' },
      managedDeps,
    );
    const failed = await verifyHostTlsDns(ctx, {
      createDnsResolver: () => ({
        setServers: () => {},
        resolve4: async () => ['213.23.215.150'],
        resolveCname: async () => [],
      }),
    });
    assert.equal(failed.tls.state, 'awaiting-operator-dns');
    assert.equal(failed.tls.lastError, null);
    const aCheck = failed.checks.find((check) => check.id === 'a-record');
    assert.match(aCheck?.message ?? '', /Catch-all/);
    assert.match(aCheck?.message ?? '', /213\.23\.215\.150/);
    assert.equal(aCheck?.detail, undefined);
  });
});

test('verify-dns keeps collision when the hostname A differs from the sibling probe', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.1.18',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: 'mudda.lan.notaus.de', lanIp: '192.168.1.18' },
      managedDeps,
    );
    const failed = await verifyHostTlsDns(ctx, {
      createDnsResolver: () => ({
        setServers: () => {},
        resolve4: async (name) => (name.startsWith('*.') ? ['213.23.215.150'] : ['10.0.0.9']),
        resolveCname: async () => [],
      }),
    });
    assert.equal(failed.tls.state, 'awaiting-operator-dns');
    assert.equal(failed.tls.lastError, null);
    assert.match(
      failed.checks.find((check) => check.id === 'a-record')?.message ?? '',
      /10\.0\.0\.9/,
    );
  });
});

test('verify-dns rejects invalid TLS_DNS_RESOLVERS before querying DNS', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
      TLS_DNS_RESOLVERS: 'not-a-resolver',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      managedDeps,
    );
    await assert.rejects(
      () => verifyHostTlsDns(ctx),
      /TLS_DNS_RESOLVERS enthält einen ungültigen Eintrag/,
    );
  });
});

test('acme-dns secret uses internal Caddy URL while host registers at TLS_ACME_DNS_API', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
      TLS_ACME_DNS_API: 'http://127.0.0.1:8053',
      TLS_ACME_DNS_CREDENTIALS_SERVER_URL: 'http://acme-dns:80',
    });
    const ctx = testSetupContext(root);
    let registeredAt = '';
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      {
        ...managedDeps,
        registerAcmeDns: async (serverUrl) => {
          registeredAt = serverUrl;
          return {
            username: 'account',
            password: 'password',
            subdomain: 'challenge-id',
            fulldomain: 'challenge-id.auth.acme.tls.lab',
            serverUrl,
          };
        },
      },
    );
    assert.equal(registeredAt, 'http://127.0.0.1:8053');
    const secret = JSON.parse(
      fs.readFileSync(resolveProxyTlsPaths(root).acmeDnsCredentials, 'utf8'),
    ) as { server_url: string; password: string };
    assert.equal(secret.server_url, 'http://acme-dns:80');
    assert.equal(secret.password, 'password');
    const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
    assert.equal(envText.includes('password'), false);
  });
});

test('acme-dns secret keeps registration URL when credentials override is unset', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      TLS_RUNTIME_FAKE: 'true',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      managedDeps,
    );
    const secret = JSON.parse(
      fs.readFileSync(resolveProxyTlsPaths(root).acmeDnsCredentials, 'utf8'),
    ) as { server_url: string };
    assert.equal(secret.server_url, 'https://auth.acme-dns.io');
  });
});

test('pebbleLocalCheckCa is ignored outside pebble and rejects missing or invalid files', () => {
  const pemPath = path.join(os.tmpdir(), `pf-pebble-ca-${process.pid}.pem`);
  fs.writeFileSync(pemPath, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
  try {
    assert.equal(
      pebbleLocalCheckCa(
        new Map([
          ['TLS_ACME_DIRECTORY', 'production'],
          ['TLS_PEBBLE_ROOT_CA_PATH', pemPath],
        ]),
      ),
      undefined,
    );
    assert.equal(pebbleLocalCheckCa(new Map([['TLS_ACME_DIRECTORY', 'pebble']])), undefined);
    assert.throws(
      () =>
        pebbleLocalCheckCa(
          new Map([
            ['TLS_ACME_DIRECTORY', 'pebble'],
            ['TLS_PEBBLE_ROOT_CA_PATH', path.join(os.tmpdir(), 'missing-pebble-ca.pem')],
          ]),
        ),
      /nicht auf eine lesbare Datei/,
    );
    const invalidPath = path.join(os.tmpdir(), `pf-pebble-ca-invalid-${process.pid}.pem`);
    fs.writeFileSync(invalidPath, 'not a cert\n');
    try {
      assert.throws(
        () =>
          pebbleLocalCheckCa(
            new Map([
              ['TLS_ACME_DIRECTORY', 'pebble'],
              ['TLS_PEBBLE_ROOT_CA_PATH', invalidPath],
            ]),
          ),
        /kein PEM-Zertifikat/,
      );
    } finally {
      fs.rmSync(invalidPath, { force: true });
    }
  } finally {
    fs.rmSync(pemPath, { force: true });
  }
});

const greenLocal = {
  certificate: {
    issuer: 'Pebble Intermediate CA',
    notBefore: '2026-08-28T00:00:00.000Z',
    notAfter: '2026-11-26T00:00:00.000Z',
    names: ['7fk3m2.lan.notaus.de'],
  },
  checks: [
    { id: 'certificate' as const, ok: true, message: 'ok' },
    { id: 'tcp-443' as const, ok: true, message: 'ok' },
    { id: 'http2' as const, ok: true, message: 'ok' },
    { id: 'sse' as const, ok: true, message: 'ok' },
  ],
};

test('obtain-certificate retries local checks until later success', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      managedDeps,
    );
    await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({
        aRecords: ['192.168.178.112'],
        cnameRecords: ['challenge-id.auth.acme-dns.io'],
      }),
    });
    let now = 0;
    let attempts = 0;
    const obtained = await obtainManagedCertificate(ctx, {
      reloadProxy: async () => undefined,
      localCheckRetry: {
        intervalMs: 10,
        timeoutMs: 100,
        now: () => now,
        sleep: async (ms) => {
          now += ms;
        },
      },
      runLocalChecks: async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('Caddy has no certificate yet');
        }
        return greenLocal;
      },
    });
    assert.equal(attempts, 3);
    assert.equal(obtained.tls.applyReady, true);
    assert.equal(obtained.tls.state, 'dns-verified');
  });
});

test('obtain-certificate timeout keeps the last local-check cause', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      managedDeps,
    );
    await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({
        aRecords: ['192.168.178.112'],
        cnameRecords: ['challenge-id.auth.acme-dns.io'],
      }),
    });
    let now = 0;
    await assert.rejects(
      () =>
        obtainManagedCertificate(ctx, {
          reloadProxy: async () => undefined,
          localCheckRetry: {
            intervalMs: 20,
            timeoutMs: 50,
            now: () => now,
            sleep: async (ms) => {
              now += ms;
            },
          },
          runLocalChecks: async () => {
            throw new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
          },
        }),
      /nach 50ms nicht grün: UNABLE_TO_VERIFY_LEAF_SIGNATURE/,
    );
  });
});

test('planProxyReloadAfterUp skips reload after recreate or first start', () => {
  assert.equal(planProxyReloadAfterUp({ proxyWasRunning: false, upLog: 'Created' }), 'none');
  assert.equal(
    planProxyReloadAfterUp({
      proxyWasRunning: true,
      upLog: 'Container praxis-flow-proxy Recreated\nContainer praxis-flow-proxy Started',
    }),
    'none',
  );
  assert.equal(
    planProxyReloadAfterUp({
      proxyWasRunning: true,
      upLog: 'Container praxis-flow-proxy Running',
    }),
    'reload',
  );
});

test('isRetryableLocalCheckError fails fast on pebble CA and PEM config', () => {
  assert.equal(
    isRetryableLocalCheckError(
      new TlsPermanentCheckError('TLS_PEBBLE_ROOT_CA_PATH zeigt nicht auf eine lesbare Datei: /x'),
    ),
    false,
  );
  assert.equal(isRetryableLocalCheckError(new Error('Caddy has no certificate yet')), true);
  assert.equal(isRetryableLocalCheckError(new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE')), true);
});

test('obtain-certificate does not retry pebble CA config errors', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
    });
    const ctx = testSetupContext(root);
    await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: '7fk3m2.lan.notaus.de', lanIp: '192.168.178.112' },
      managedDeps,
    );
    await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({
        aRecords: ['192.168.178.112'],
        cnameRecords: ['challenge-id.auth.acme-dns.io'],
      }),
    });
    let attempts = 0;
    let slept = false;
    await assert.rejects(
      () =>
        obtainManagedCertificate(ctx, {
          reloadProxy: async () => undefined,
          localCheckRetry: {
            intervalMs: 10,
            timeoutMs: 100,
            now: () => 0,
            sleep: async () => {
              slept = true;
            },
          },
          runLocalChecks: async () => {
            attempts += 1;
            throw new TlsPermanentCheckError(
              'TLS_PEBBLE_ROOT_CA_PATH zeigt nicht auf eine lesbare Datei: /missing.pem',
            );
          },
        }),
      /TLS_PEBBLE_ROOT_CA_PATH zeigt nicht auf eine lesbare Datei/,
    );
    assert.equal(attempts, 1);
    assert.equal(slept, false);
  });
});

test('check-certificate does not poll ACME readiness', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
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
    stageCustomCertificate(ctx, {
      fullchainPem: fs.readFileSync(certPath, 'utf8'),
      privateKeyPem: fs.readFileSync(keyPath, 'utf8'),
    });
    await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({ aRecords: ['192.168.178.112'], cnameRecords: [] }),
    });
    let attempts = 0;
    let slept = false;
    await assert.rejects(
      () =>
        checkCustomCertificate(ctx, {
          reloadProxy: async () => undefined,
          localCheckRetry: {
            intervalMs: 10,
            timeoutMs: 100,
            now: () => 0,
            sleep: async () => {
              slept = true;
            },
          },
          runLocalChecks: async () => {
            attempts += 1;
            throw new Error('TLS auf Port 443 nicht erreichbar: timeout');
          },
        }),
      /TLS auf Port 443 nicht erreichbar/,
    );
    assert.equal(attempts, 1);
    assert.equal(slept, false);
  });
});
