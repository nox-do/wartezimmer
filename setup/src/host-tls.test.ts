import { recoverTlsOperation } from './host-tls.js';
import { captureTlsRollback } from './tls-operation-files.js';
import {
  tlsIdentityReference,
  readTlsOperation,
  readTlsOperationStatus,
  writeTlsOperation,
  tlsOperationPath,
  tlsRollbackDirectory,
  type TlsOperation,
} from './tls-operation.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PORTAL_ENTRY_REDIRECT,
  PORTAL_INTERNAL_ROUTES,
  PORTAL_STATIC_SURFACE_ROUTES,
  PORTAL_SURFACE_ROUTES,
  PORTAL_UI_SURFACE_ROUTES,
  type TlsCertificateStatus,
} from '@wartezimmer/server-shared';
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
  renewHostTls,
  resetHostTls,
  stageCustomCertificate,
  TlsPermanentCheckError,
  TLS_DNS_RESOLVERS_DEFAULT,
  transitionTlsStatus,
  verifyHostTlsDns,
  validateCustomCertificate,
  wildcardProbeHostname,
} from './host-tls.js';
import {
  GENERATED_CADDYFILE_MARKER,
  generateTlsCaddyfile,
  portalApiCaddyMatcher,
  portalSurfacePathRegexp,
  resolveProxyTlsPaths,
  writeGeneratedTlsCaddyfile,
  writeSecretFileAtomically,
} from './proxy-tls.js';
import { testSetupContext } from './test-helpers/test-setup-context.js';

const certificate: TlsCertificateStatus = {
  issuer: "Let's Encrypt",
  notBefore: '2026-08-28T00:00:00.000Z',
  notAfter: '2026-11-26T00:00:00.000Z',
  names: ['7fk3m2.lan.notaus.de'],
};

function writeEnv(root: string, entries: Record<string, string>) {
  const completeEntries = {
    SETUP_LAN_APP_IP: entries.TLS_LAN_IP ?? '192.168.178.112',
    ...entries,
  };
  fs.writeFileSync(
    path.join(root, '.env'),
    `${Object.entries(completeEntries)
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
    'installationDomain',
    'installationId',
    'lastError',
    'mode',
    'portalHostname',
    'staffHostname',
    'state',
    'tokenConsumed',
    'wildcardCertificateName',
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
    assert.equal(prepared.tls.installationDomain, '7fk3m2.lan.notaus.de');
    assert.equal(prepared.tls.staffHostname, 'staff.7fk3m2.lan.notaus.de');
    assert.equal(prepared.tls.hostname, 'staff.7fk3m2.lan.notaus.de');
    assert.equal(prepared.tls.portalHostname, 'portal.7fk3m2.lan.notaus.de');
    assert.equal(prepared.tls.wildcardCertificateName, '*.7fk3m2.lan.notaus.de');
    assert.equal(prepared.operatorRequest?.aRecord.name, 'staff.7fk3m2.lan.notaus.de');
    assert.equal(prepared.operatorRequest?.acmeCname.name, '_acme-challenge.7fk3m2.lan.notaus.de');
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
    assert.deepEqual(obtained.tls.certificate?.names, ['*.7fk3m2.lan.notaus.de']);
    assert.equal(fs.existsSync(resolveProxyTlsPaths(root).operatorToken), false);
    assert.equal(readEnvMap(path.join(root, '.env')).get('PROXY_MODE'), 'http');

    const applied = await applyHostTls(ctx);
    assert.equal(applied.tls.state, 'active');
    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('PROXY_MODE'), 'tls-managed');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'https://staff.7fk3m2.lan.notaus.de');
    assert.equal(env.get('TLS_INSTALLATION_DOMAIN'), '7fk3m2.lan.notaus.de');
    assert.equal(env.get('TLS_STAFF_HOSTNAME'), 'staff.7fk3m2.lan.notaus.de');
    assert.equal(env.get('TLS_PORTAL_HOSTNAME'), 'portal.7fk3m2.lan.notaus.de');
    assert.equal(env.get('TLS_WILDCARD_CERTIFICATE_NAME'), '*.7fk3m2.lan.notaus.de');
    assert.equal(env.get('TRUST_PROXY_HEADERS'), 'true');
    const caddyfile = fs.readFileSync(resolveProxyTlsPaths(root).caddyfile, 'utf8');
    assert.match(caddyfile, /redir https:\/\/staff\.7fk3m2\.lan\.notaus\.de\{uri\} permanent/);
    assert.match(caddyfile, /\*\.7fk3m2\.lan\.notaus\.de \{/);
    assert.match(caddyfile, /@staff host staff\.7fk3m2\.lan\.notaus\.de/);
    assert.doesNotMatch(caddyfile, /\nstaff\.7fk3m2\.lan\.notaus\.de \{/);
    assert.match(caddyfile, /\n\t\tabort\n/);
    assert.match(caddyfile, /https:\/\/127\.0\.0\.1 \{/);
    assert.match(caddyfile, /respond \/__wartezimmer\/health "ok" 200/);
  });
});

test('rewriting generated TLS mount files preserves their inode for Docker bind mounts', async () => {
  await withRoot(async (root) => {
    const paths = resolveProxyTlsPaths(root);
    fs.mkdirSync(paths.root, { recursive: true });
    fs.writeFileSync(paths.caddyfile, ':80 { respond "old" }\n', 'utf8');
    fs.writeFileSync(paths.acmeDnsCredentials, '{}\n', { encoding: 'utf8', mode: 0o600 });
    const caddyfileInodeBefore = fs.statSync(paths.caddyfile).ino;
    const credentialsInodeBefore = fs.statSync(paths.acmeDnsCredentials).ino;

    writeGeneratedTlsCaddyfile(
      root,
      {
        ...emptyTlsStatus(),
        state: 'dns-verified',
        mode: 'managed',
        hostname: 'staff.7fk3m2.lan.notaus.de',
        staffHostname: 'staff.7fk3m2.lan.notaus.de',
        wildcardCertificateName: '*.7fk3m2.lan.notaus.de',
      },
      new Map(),
    );

    writeSecretFileAtomically(paths.acmeDnsCredentials, '{"username":"account"}\n');

    assert.equal(fs.statSync(paths.caddyfile).ino, caddyfileInodeBefore);
    assert.equal(fs.statSync(paths.acmeDnsCredentials).ino, credentialsInodeBefore);
    assert.match(fs.readFileSync(paths.caddyfile, 'utf8'), /\*\.7fk3m2\.lan\.notaus\.de/);
    assert.equal(fs.readFileSync(paths.acmeDnsCredentials, 'utf8'), '{"username":"account"}\n');
  });
});

test('apply rolls back Canonical and Caddyfile when proxy reload fails', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      SETUP_LAN_APP_IP: '192.168.178.112',
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
    let checkedConnectHost = '';
    await obtainManagedCertificate(ctx, {
      reloadProxy: async () => undefined,
      runLocalChecks: async (_hostname, _port, connectHost) => {
        checkedConnectHost = connectHost;
        return greenLocal;
      },
    });
    assert.equal(checkedConnectHost, '192.168.178.112');
    assert.equal(readTlsOperation(root), null);
    await assert.rejects(
      () =>
        applyHostTls(ctx, {
          stopProxy: async () => undefined,
          reloadProxy: async () => {
            throw new Error('Caddy konnte nicht neu geladen werden.');
          },
        }),
      /TLS-Recovery ungeklärt/,
    );
    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('PROXY_MODE'), 'http');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'http://192.168.178.112');
    assert.equal(env.get('TLS_STATE'), 'dns-verified');
    assert.equal(env.get('TLS_APPLY_READY'), 'true');
    assert.equal(env.get('TLS_CUTOVER_APPLIED'), 'false');
    assert.equal(readTlsOperation(root)?.phase, 'recovery-failed');
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
    const applied = await applyHostTls(ctx);
    assert.equal(applied.tls.state, 'active');
    assert.equal(
      readEnvMap(path.join(root, '.env')).get('CANONICAL_BASE_URL'),
      'https://flow.praxis-meyer.de',
    );
    const renewed = await renewHostTls(ctx, {
      fullchainPem: fs.readFileSync(certPath, 'utf8'),
      privateKeyPem: fs.readFileSync(keyPath, 'utf8'),
    });
    assert.equal(renewed.tls.state, 'active');
    assert.equal(renewed.tls.portalHostname, null);
    const paths = resolveProxyTlsPaths(root);
    const oldFullchain = fs.readFileSync(paths.customFullchain, 'utf8');
    const oldKey = fs.readFileSync(paths.customPrivateKey, 'utf8');
    const oldStatus = readTlsStatus(readEnvMap(path.join(root, '.env')));
    // New valid pair; the live chain/connection check can still fail after reload.
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
        '3',
        '-keyout',
        keyPath,
        '-out',
        certPath,
      ],
      { stdio: 'ignore' },
    );
    fs.appendFileSync(path.join(root, '.env'), '\nTLS_RUNTIME_FAKE=false\n');
    let reloads = 0;
    await assert.rejects(
      () =>
        renewHostTls(
          ctx,
          {
            fullchainPem: fs.readFileSync(certPath, 'utf8'),
            privateKeyPem: fs.readFileSync(keyPath, 'utf8'),
          },
          {
            stopProxy: async () => undefined,
            reloadProxy: async () => {
              reloads++;
            },
            verifyAccess: async () => {
              if (reloads === 1) throw new Error('replacement chain not trusted');
            },
          },
        ),
      /bisherige Zugang wurde wiederhergestellt/,
    );
    assert.equal(reloads, 2);
    assert.equal(fs.readFileSync(paths.customFullchain, 'utf8'), oldFullchain);
    assert.equal(fs.readFileSync(paths.customPrivateKey, 'utf8'), oldKey);
    const rolledBack = readTlsStatus(readEnvMap(path.join(root, '.env')));
    assert.deepEqual(rolledBack.certificate, oldStatus.certificate);
    assert.equal(rolledBack.state, oldStatus.state);
    assert.equal(readTlsOperation(root), null);
    assert.equal(rolledBack.cutoverApplied, true);
    assert.equal(
      readEnvMap(path.join(root, '.env')).get('CANONICAL_BASE_URL'),
      'https://flow.praxis-meyer.de',
    );

    await assert.rejects(() => resetHostTls(ctx), /Custom|custom|Cutover/);
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

function activeManagedEnv(): Record<string, string> {
  return {
    SETUP_LAN_APP_IP: '192.168.178.112',
    PROXY_ENABLED: 'true',
    PROXY_MODE: 'tls-managed',
    CANONICAL_BASE_URL: 'https://staff.7fk3m2.lan.notaus.de',
    TLS_RUNTIME_FAKE: 'true',
    TLS_MODE: 'managed',
    TLS_STATE: 'active',
    TLS_CUTOVER_APPLIED: 'true',
    TLS_HOSTNAME: 'staff.7fk3m2.lan.notaus.de',
    TLS_STAFF_HOSTNAME: 'staff.7fk3m2.lan.notaus.de',
    TLS_INSTALLATION_DOMAIN: '7fk3m2.lan.notaus.de',
    TLS_WILDCARD_CERTIFICATE_NAME: '*.7fk3m2.lan.notaus.de',
    TLS_INSTALLATION_ID: '7fk3m2q9',
  };
}

for (const action of ['reset', 'renew'] as const) {
  test(`managed TLS ${action} after cutover can internally re-obtain the same identity`, async () => {
    await withRoot(async (root) => {
      writeEnv(root, activeManagedEnv());
      const ctx = testSetupContext(root);
      const result = action === 'reset' ? await resetHostTls(ctx) : await renewHostTls(ctx);
      assert.equal(result.tls.state, 'active');
      assert.equal(result.tls.cutoverApplied, true);
      assert.equal(result.tls.installationId, '7fk3m2q9');
      assert.equal(readEnvMap(path.join(root, '.env')).get('TLS_STATE'), 'active');
    });
  });
}

test('generated Caddyfile keeps HTTP app before cutover and uses ACME-DNS without secrets', () => {
  const status = {
    ...emptyTlsStatus(),
    state: 'dns-verified' as const,
    mode: 'managed' as const,
    hostname: 'staff.7fk3m2.lan.notaus.de',
    installationDomain: '7fk3m2.lan.notaus.de',
    staffHostname: 'staff.7fk3m2.lan.notaus.de',
    portalHostname: 'portal.7fk3m2.lan.notaus.de',
    wildcardCertificateName: '*.7fk3m2.lan.notaus.de',
    installationId: '7fk3m2q9',
  };
  const caddyfile = generateTlsCaddyfile(status, new Map([['SETUP_RESTRICTED_ENABLED', 'true']]));
  assert.match(caddyfile, new RegExp(GENERATED_CADDYFILE_MARKER));
  assert.match(caddyfile, /:80 \{\n\t@staff host staff\.7fk3m2\.lan\.notaus\.de/);
  assert.match(caddyfile, /handle \{\n\t\tabort/);
  assert.match(caddyfile, /handle @staff \{\n\t\treverse_proxy app:8080/);
  assert.match(caddyfile, /dns acmedns \/run\/secrets\/acme-dns\.json/);
  assert.match(caddyfile, /disable_http_challenge/);
  assert.match(caddyfile, /disable_tlsalpn_challenge/);
  assert.doesNotMatch(caddyfile, /password|oneTimeToken/);
  assert.doesNotMatch(caddyfile, /resolvers coredns/);
  assert.match(caddyfile, /resolvers 1\.1\.1\.1:53/);
  assert.match(caddyfile, /\*\.7fk3m2\.lan\.notaus\.de \{/);
  assert.match(caddyfile, /@staff host staff\.7fk3m2\.lan\.notaus\.de/);
  assert.doesNotMatch(caddyfile, /\nstaff\.7fk3m2\.lan\.notaus\.de \{/);
  assert.match(caddyfile, /host portal\.7fk3m2\.lan\.notaus\.de/);
  assert.match(caddyfile, /https:\/\/\*\.7fk3m2\.lan\.notaus\.de:444 \{/);
});

test('generated managed Caddyfile derives a strict restricted listener from the portal contract', () => {
  const status = {
    ...emptyTlsStatus(),
    state: 'active' as const,
    mode: 'managed' as const,
    hostname: 'staff.7fk3m2.lan.notaus.de',
    installationDomain: '7fk3m2.lan.notaus.de',
    staffHostname: 'staff.7fk3m2.lan.notaus.de',
    portalHostname: 'portal.7fk3m2.lan.notaus.de',
    wildcardCertificateName: '*.7fk3m2.lan.notaus.de',
    installationId: '7fk3m2q9',
    cutoverApplied: true,
  };
  const caddyfile = generateTlsCaddyfile(status, new Map([['SETUP_RESTRICTED_ENABLED', 'true']]));

  assert.match(caddyfile, /https:\/\/\*\.7fk3m2\.lan\.notaus\.de:444 \{/);
  assert.doesNotMatch(caddyfile, /https:\/\/portal\.7fk3m2\.lan\.notaus\.de:444/);
  assert.match(
    caddyfile,
    /@portalOrigin \{\n\t\thost portal\.7fk3m2\.lan\.notaus\.de\n\t\texpression \{http\.request\.tls\.server_name\} == "portal\.7fk3m2\.lan\.notaus\.de"/,
  );
  assert.match(
    caddyfile,
    /@staff \{\n\t\thost staff\.7fk3m2\.lan\.notaus\.de\n\t\texpression \{http\.request\.tls\.server_name\} == "staff\.7fk3m2\.lan\.notaus\.de"/,
  );

  for (const [index, route] of PORTAL_SURFACE_ROUTES.entries()) {
    assert.ok(portalApiCaddyMatcher(route, index).every((line) => caddyfile.includes(line)));
  }
  assert.equal(
    (caddyfile.match(/\n\t\t@portalApi\d+ \{/g) ?? []).length,
    PORTAL_SURFACE_ROUTES.length,
  );
  for (const route of PORTAL_INTERNAL_ROUTES)
    assert.doesNotMatch(caddyfile, new RegExp(route.path));

  for (const route of PORTAL_UI_SURFACE_ROUTES) assert.match(caddyfile, new RegExp(route.path));
  assert.ok(
    caddyfile.includes(
      `method ${PORTAL_ENTRY_REDIRECT.methods.join(' ')}\n\t\t\tpath ${PORTAL_ENTRY_REDIRECT.path}`,
    ),
  );
  assert.ok(
    caddyfile.includes(
      `redir * ${PORTAL_ENTRY_REDIRECT.location} ${PORTAL_ENTRY_REDIRECT.statusCode}`,
    ),
  );
  for (const route of PORTAL_STATIC_SURFACE_ROUTES) {
    assert.ok(caddyfile.includes(route.path));
  }
  assert.doesNotMatch(caddyfile, /path \/api\/\*/);
  assert.doesNotMatch(caddyfile, /path \/\*/);
  assert.match(caddyfile, /header X-Wartezimmer-Rejection portal-policy\n\t\t\trespond 404/);
  assert.match(caddyfile, /servers \{\n\t\tprotocols h1 h2/);
  assert.match(caddyfile, /:443 \{\n\tabort\n\}/);
  assert.match(caddyfile, /https:\/\/:444 \{\n\tabort\n\}/);
});

test('portal parameter templates become anchored single-segment Caddy regexps', () => {
  assert.equal(
    portalSurfacePathRegexp('/api/v1/portal/documents/:documentId/delete'),
    '^/api/v1/portal/documents/[^/]+/delete$',
  );
});

test('generated managed and custom Caddyfiles expose the dedicated internal TLS health site', () => {
  for (const mode of ['managed', 'custom'] as const) {
    const caddyfile = generateTlsCaddyfile(
      {
        ...emptyTlsStatus(),
        state: 'dns-verified',
        mode,
        hostname: 'flow.praxis-meyer.de',
        installationId: 'test-installation',
      },
      new Map(),
    );
    assert.match(
      caddyfile,
      /https:\/\/127\.0\.0\.1 \{\n\ttls internal\n\trespond \/__wartezimmer\/health "ok" 200\n\}/,
    );
  }
});

test('generated custom Caddyfile requires matching Staff host and SNI', () => {
  const caddyfile = generateTlsCaddyfile(
    {
      ...emptyTlsStatus(),
      state: 'active',
      mode: 'custom',
      hostname: 'flow.praxis.example',
      staffHostname: 'flow.praxis.example',
      portalHostname: null,
      wildcardCertificateName: null,
      cutoverApplied: true,
    },
    new Map(),
  );
  assert.match(caddyfile, /host flow\.praxis\.example/);
  assert.match(
    caddyfile,
    /expression \{http\.request\.tls\.server_name\} == "flow\.praxis\.example"/,
  );
  assert.match(caddyfile, /handle \{\n\t\tabort/);
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
  assert.doesNotMatch(caddyfile, /resolvers 1\.1\.1\.1/);
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
    const cnameQueries: string[] = [];
    const verified = await verifyHostTlsDns(ctx, {
      createDnsResolver: () => ({
        setServers: (value) => {
          servers = value;
        },
        resolve4: async () => ['192.168.178.112'],
        resolveCname: async (name) => {
          cnameQueries.push(name);
          return ['challenge-id.auth.acme-dns.io'];
        },
      }),
    });
    assert.deepEqual(servers, [...TLS_DNS_RESOLVERS_DEFAULT]);
    assert.deepEqual(cnameQueries, ['_acme-challenge.7fk3m2.lan.notaus.de']);
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
      /TLS-Prüfkonfiguration ist unvollständig/,
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
        /TLS-Prüfkonfiguration ist ungültig/,
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
      /nicht rechtzeitig erfolgreich/,
    );
  });
});

test('planProxyReloadAfterUp skips reload after recreate or first start', () => {
  assert.equal(planProxyReloadAfterUp({ proxyWasRunning: false, upLog: 'Created' }), 'none');
  assert.equal(
    planProxyReloadAfterUp({
      proxyWasRunning: true,
      upLog: 'Container wartezimmer-proxy Recreated\nContainer wartezimmer-proxy Started',
    }),
    'none',
  );
  assert.equal(
    planProxyReloadAfterUp({
      proxyWasRunning: true,
      upLog: 'Container wartezimmer-proxy Running',
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
              'Die lokale TLS-Prüfkonfiguration ist unvollständig.',
              { cause: new Error('TLS_PEBBLE_ROOT_CA_PATH ist nicht lesbar: /missing.pem') },
            );
          },
        }),
      /TLS-Prüfkonfiguration ist unvollständig/,
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

test('own-domain ACME keeps wildcard identity through resume, obtain, apply and renewal', async () => {
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
        hostname: 'flow.praxis-meyer.de',
        lanIp: '192.168.178.112',
      },
      deps,
    );
    assert.equal(prepared.tls.state, 'awaiting-operator-dns');
    assert.equal(prepared.tls.installationDomain, 'flow.praxis-meyer.de');
    assert.equal(prepared.tls.staffHostname, 'staff.flow.praxis-meyer.de');
    assert.equal(prepared.tls.hostname, 'staff.flow.praxis-meyer.de');
    assert.equal(prepared.tls.portalHostname, 'portal.flow.praxis-meyer.de');
    assert.equal(prepared.tls.wildcardCertificateName, '*.flow.praxis-meyer.de');
    assert.equal(prepared.operatorRequest?.aRecord.name, 'staff.flow.praxis-meyer.de');
    assert.equal(prepared.operatorRequest?.acmeCname.name, '_acme-challenge.flow.praxis-meyer.de');
    assert.ok(prepared.operatorRequest?.oneTimeToken);
    assert.equal(readEnvMap(path.join(root, '.env')).get('PROXY_MODE'), 'http');

    const resumed = await prepareHostTls(
      ctx,
      { mode: 'managed', hostname: 'flow.praxis-meyer.de', lanIp: '192.168.178.112' },
      {
        registerAcmeDns: async () => {
          throw new Error('must reuse registration');
        },
      },
    );
    assert.deepEqual(resumed.operatorRequest, prepared.operatorRequest);
    const missingCname = await verifyHostTlsDns(ctx, {
      verifyDns: async () => ({ aRecords: ['192.168.178.112'], cnameRecords: [] }),
    });
    assert.equal(missingCname.tls.state, 'awaiting-operator-dns');
    assert.equal(missingCname.checks.find((c) => c.id === 'acme-cname')?.ok, false);

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
    assert.deepEqual(obtained.tls.certificate?.names, ['*.flow.praxis-meyer.de']);
    assert.equal(fs.existsSync(resolveProxyTlsPaths(root).operatorToken), false);
    assert.equal(readEnvMap(path.join(root, '.env')).get('PROXY_MODE'), 'http');

    const applied = await applyHostTls(ctx);
    assert.equal(applied.tls.state, 'active');
    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('PROXY_MODE'), 'tls-managed');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'https://staff.flow.praxis-meyer.de');
    assert.equal(env.get('TLS_INSTALLATION_DOMAIN'), 'flow.praxis-meyer.de');
    assert.equal(env.get('TLS_STAFF_HOSTNAME'), 'staff.flow.praxis-meyer.de');
    assert.equal(env.get('TLS_PORTAL_HOSTNAME'), 'portal.flow.praxis-meyer.de');
    assert.equal(env.get('TLS_WILDCARD_CERTIFICATE_NAME'), '*.flow.praxis-meyer.de');
    assert.equal(env.get('TRUST_PROXY_HEADERS'), 'true');
    const caddyfile = fs.readFileSync(resolveProxyTlsPaths(root).caddyfile, 'utf8');
    assert.match(caddyfile, /redir https:\/\/staff\.flow\.praxis-meyer\.de\{uri\} permanent/);
    assert.match(caddyfile, /\*\.flow\.praxis-meyer\.de \{/);
    assert.match(caddyfile, /@staff host staff\.flow\.praxis-meyer\.de/);
    assert.doesNotMatch(caddyfile, /\nstaff\.flow\.praxis-meyer\.de \{/);
    assert.match(caddyfile, /\n\t\tabort\n/);
    assert.match(caddyfile, /https:\/\/127\.0\.0\.1 \{/);
    const renewed = await renewHostTls(ctx);
    assert.equal(renewed.tls.state, 'active');
    assert.equal(renewed.tls.hostname, 'staff.flow.praxis-meyer.de');
    assert.deepEqual(renewed.tls.certificate?.names, ['*.flow.praxis-meyer.de']);
    assert.match(caddyfile, /respond \/__wartezimmer\/health "ok" 200/);
  });
});

test('PEM validation rejects wrong names, validity dates and a mismatched key of different length', async () => {
  await withRoot(async (root) => {
    const certPath = path.join(root, 'cert.pem');
    const keyPath = path.join(root, 'key.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=unused.example.org',
        '-addext',
        'subjectAltName=DNS:*.praxis-meyer.de',
        '-days',
        '2',
        '-keyout',
        keyPath,
        '-out',
        certPath,
      ],
      { stdio: 'ignore' },
    );
    const input = {
      fullchainPem: fs.readFileSync(certPath, 'utf8'),
      privateKeyPem: fs.readFileSync(keyPath, 'utf8'),
    };
    assert.deepEqual(validateCustomCertificate(input, 'flow.praxis-meyer.de').names, [
      '*.praxis-meyer.de',
    ]);
    assert.throws(
      () => validateCustomCertificate(input, 'staff.flow.praxis-meyer.de'),
      /gilt nicht/,
    );
    assert.throws(() => validateCustomCertificate(input, 'praxis-meyer.de'), /gilt nicht/);
    assert.throws(
      () => validateCustomCertificate(input, 'flow.praxis-meyer.de', new Date('2000-01-01')),
      /noch nicht gültig/,
    );
    assert.throws(
      () => validateCustomCertificate(input, 'flow.praxis-meyer.de', new Date('2100-01-01')),
      /abgelaufen/,
    );
    execFileSync(
      'openssl',
      ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', keyPath],
      { stdio: 'ignore' },
    );
    assert.throws(
      () =>
        validateCustomCertificate(
          { ...input, privateKeyPem: fs.readFileSync(keyPath, 'utf8') },
          'flow.praxis-meyer.de',
        ),
      /Privater Schlüssel passt nicht/,
    );
    assert.throws(
      () =>
        validateCustomCertificate({ ...input, privateKeyPem: 'invalid' }, 'flow.praxis-meyer.de'),
      /kein gültiges PEM/,
    );
  });
});

for (const hostname of ['lan.notaus.de', 'staff.lan.notaus.de', 'nested.label.lan.notaus.de']) {
  test(`managed operator zone still rejects invalid installation name ${hostname}`, async () => {
    await withRoot(async (root) => {
      writeEnv(root, { PROXY_ENABLED: 'true', PROXY_MODE: 'http' });
      await assert.rejects(
        () =>
          prepareHostTls(testSetupContext(root), {
            mode: 'managed',
            hostname,
            lanIp: '192.168.178.112',
          }),
        /DNS-Label|reserviert/,
      );
      assert.equal(readTlsStatus(readEnvMap(path.join(root, '.env'))).state, 'off');
    });
  });
}

function tlsJournal(root: string, phase: TlsOperation['phase'] = 'prepared'): TlsOperation {
  const base = {
    schemaVersion: 1 as const,
    id: 'tls-crash-boundary-0001',
    createdAt: new Date().toISOString(),
    action: 'renew' as const,
    identity: tlsIdentityReference(readEnvMap(path.join(root, '.env'))),
  };
  return phase === 'recovery-failed'
    ? { ...base, phase, recovery: 'rollback' }
    : { ...base, phase };
}

test('TLS recovery before cutover checks the confirmed HTTP configuration, ignoring incomplete snapshots', async () => {
  for (const phase of ['prepared', 'rollback-ready'] as const) {
    await withRoot(async (root) => {
      writeEnv(root, {
        ...activeManagedEnv(),
        TLS_RUNTIME_FAKE: 'false',
        PROXY_MODE: 'http',
        TLS_STATE: 'dns-verified',
        TLS_CUTOVER_APPLIED: 'false',
        CANONICAL_BASE_URL: 'http://192.168.178.112',
      });
      const ctx = testSetupContext(root);
      const oldEnv = fs.readFileSync(path.join(root, '.env'), 'utf8');
      writeGeneratedTlsCaddyfile(
        root,
        readTlsStatus(readEnvMap(path.join(root, '.env'))),
        readEnvMap(path.join(root, '.env')),
      );
      const operation = { ...tlsJournal(root, phase), action: 'cutover' as const };
      writeTlsOperation(root, operation);
      if (phase === 'rollback-ready') captureTlsRollback(root, operation);
      else {
        fs.mkdirSync(tlsRollbackDirectory(root, operation.id), { recursive: true });
        fs.writeFileSync(path.join(tlsRollbackDirectory(root, operation.id), '.env'), 'partial');
      }
      let checked = false;
      const result = await recoverTlsOperation(ctx, {
        stopProxy: async () => assert.fail('no rollback before cutover'),
        reloadProxy: async () => {
          assert.doesNotMatch(
            fs.readFileSync(resolveProxyTlsPaths(root).caddyfile, 'utf8'),
            /redir https:/,
          );
        },
        verifyAccess: async (_ctx, env) => {
          checked = true;
          assert.equal(env.get('PROXY_MODE'), 'http');
        },
      });
      assert.equal(result.ok, true);
      assert.equal(checked, true);
      assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), oldEnv);
      assert.equal(readTlsOperation(root), null);
    });
  }
});

test('TLS rollback retains old custom keys and managed data across interrupted recovery without HTTP downgrade', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      ...activeManagedEnv(),
      TLS_MODE: 'custom',
      PROXY_MODE: 'tls-custom',
      TLS_RUNTIME_FAKE: 'false',
    });
    const ctx = testSetupContext(root);
    const paths = resolveProxyTlsPaths(root);
    writeGeneratedTlsCaddyfile(
      root,
      readTlsStatus(readEnvMap(path.join(root, '.env'))),
      readEnvMap(path.join(root, '.env')),
    );
    writeSecretFileAtomically(paths.customFullchain, 'previous certificate');
    writeSecretFileAtomically(paths.customPrivateKey, 'previous private key');
    fs.writeFileSync(path.join(paths.caddyData, 'account'), 'old managed account');
    const operation = tlsJournal(root, 'cutover');
    captureTlsRollback(root, operation);
    writeTlsOperation(root, operation);
    writeSecretFileAtomically(paths.customPrivateKey, 'partial replacement');
    let calls = 0;
    const deps = {
      stopProxy: async () => undefined,
      reloadProxy: async () => undefined,
      verifyAccess: async (_ctx: unknown, env: Map<string, string>) => {
        calls++;
        assert.equal(env.get('PROXY_MODE'), 'tls-custom');
        assert.equal(env.get('TLS_CUTOVER_APPLIED'), 'true');
        assert.equal(fs.readFileSync(paths.customPrivateKey, 'utf8'), 'previous private key');
        if (calls === 1) throw new Error('private recovery diagnostic');
      },
    };
    assert.equal((await recoverTlsOperation(ctx, deps)).ok, false);
    assert.deepEqual(readTlsOperation(root), {
      ...operation,
      phase: 'recovery-failed',
      recovery: 'rollback',
    });
    assert.match(readEnvMap(path.join(root, '.env')).get('CANONICAL_BASE_URL')!, /^https:/);
    assert.doesNotMatch(
      fs.readFileSync(tlsOperationPath(root), 'utf8'),
      /private|certificate|account/,
    );
    await assert.rejects(() => renewHostTls(ctx), { code: 'tls_operation_inconsistent' });
    // A second interruption may leave any subset of files replaced. The source is reusable.
    fs.rmSync(paths.certs, { recursive: true });
    fs.writeFileSync(path.join(paths.caddyData, 'account'), 'partial account');
    assert.equal((await recoverTlsOperation(ctx, deps)).ok, true);
    assert.equal(fs.readFileSync(paths.customFullchain, 'utf8'), 'previous certificate');
    assert.equal(fs.readFileSync(paths.customPrivateKey, 'utf8'), 'previous private key');
    assert.equal(
      fs.readFileSync(path.join(paths.caddyData, 'account'), 'utf8'),
      'old managed account',
    );
    assert.equal(readTlsOperation(root), null);
    assert.equal(calls, 2);
  });
});

test('terminal TLS markers only clean artifacts and never reload or change access', async () => {
  for (const phase of ['committed', 'recovered'] as const)
    await withRoot(async (root) => {
      writeEnv(root, { ...activeManagedEnv(), TLS_RUNTIME_FAKE: 'false' });
      const operation = tlsJournal(root, phase);
      captureTlsRollback(root, operation);
      writeTlsOperation(root, operation);
      const before = fs.readFileSync(path.join(root, '.env'), 'utf8');
      const unexpected = async () => assert.fail('terminal recovery cannot mutate runtime');
      assert.equal(
        (
          await recoverTlsOperation(testSetupContext(root), {
            stopProxy: unexpected,
            reloadProxy: unexpected,
            verifyAccess: unexpected,
          })
        ).ok,
        true,
      );
      assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
      assert.equal(fs.existsSync(tlsRollbackDirectory(root, operation.id)), false);
      assert.equal(readTlsOperation(root), null);
    });
});

test('unreadable TLS evidence remains intact and direct mutation cannot overtake recovery', async () => {
  await withRoot(async (root) => {
    writeEnv(root, { ...activeManagedEnv(), TLS_RUNTIME_FAKE: 'false' });
    const ctx = testSetupContext(root);
    writeTlsOperation(root, tlsJournal(root));
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const recovery = recoverTlsOperation(ctx, {
      reloadProxy: async () => pending,
      verifyAccess: async () => undefined,
    });
    try {
      await assert.rejects(() => resetHostTls(ctx), { code: 'host_mutation_conflict' });
      assert.equal(readTlsOperationStatus(root)?.kind, 'pending');
    } finally {
      release();
      await recovery;
    }
    fs.writeFileSync(tlsOperationPath(root), '{secret diagnostic');
    await assert.rejects(() => recoverTlsOperation(ctx));
    await assert.rejects(() => resetHostTls(ctx), { code: 'tls_operation_inconsistent' });
    assert.deepEqual(readTlsOperationStatus(root), { kind: 'unreadable' });
    assert.equal(fs.readFileSync(tlsOperationPath(root), 'utf8'), '{secret diagnostic');
  });
});

test('TLS cutover journals and synchronizes the original files before touching active access', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      ...activeManagedEnv(),
      TLS_RUNTIME_FAKE: 'false',
      PROXY_MODE: 'http',
      TLS_CUTOVER_APPLIED: 'false',
      TLS_STATE: 'dns-verified',
      TLS_APPLY_READY: 'true',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
    });
    const ctx = testSetupContext(root);
    writeGeneratedTlsCaddyfile(
      root,
      readTlsStatus(readEnvMap(path.join(root, '.env'))),
      readEnvMap(path.join(root, '.env')),
    );
    await applyHostTls(ctx, {
      stopProxy: async () => {
        assert.equal(readTlsOperation(root)?.phase, 'prepared');
      },
      reloadProxy: async () => {
        const op = readTlsOperation(root)!;
        assert.equal(op.phase, 'cutover');
        const snapshot = tlsRollbackDirectory(root, op.id);
        assert.equal(readEnvMap(path.join(snapshot, '.env')).get('PROXY_MODE'), 'http');
        assert.ok(fs.existsSync(path.join(snapshot, 'manifest.json')));
        assert.equal(fs.statSync(snapshot).mode & 0o777, 0o700);
        assert.equal(readEnvMap(path.join(root, '.env')).get('PROXY_MODE'), 'tls-managed');
      },
      verifyAccess: async () => undefined,
    });
    assert.equal(readTlsOperation(root), null);
    assert.equal(readTlsStatus(readEnvMap(path.join(root, '.env'))).cutoverApplied, true);
  });
});

test('failed pre-cutover recovery persists restart direction without applying the prepared target', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      ...activeManagedEnv(),
      TLS_RUNTIME_FAKE: 'false',
      PROXY_MODE: 'http',
      TLS_CUTOVER_APPLIED: 'false',
      TLS_STATE: 'dns-verified',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
    });
    const ctx = testSetupContext(root);
    const op = { ...tlsJournal(root), action: 'cutover' as const };
    writeTlsOperation(root, op);
    const before = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const result = await recoverTlsOperation(ctx, {
      reloadProxy: async () => {
        throw new Error('private proxy diagnostic');
      },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(readTlsOperation(root), {
      ...op,
      phase: 'recovery-failed',
      recovery: 'restart',
    });
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
    assert.equal(
      (
        await recoverTlsOperation(ctx, {
          reloadProxy: async () => undefined,
          verifyAccess: async () => undefined,
        })
      ).ok,
      true,
    );
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
  });
});

test('TLS mutations reject redirected Caddy mounts before stopping or journaling', async () => {
  await withRoot(async (root) => {
    writeEnv(root, { ...activeManagedEnv(), PROXY_CADDY_DATA_HOST_PATH: '/external-caddy-data' });
    await assert.rejects(
      () =>
        resetHostTls(testSetupContext(root), {
          stopProxy: async () => assert.fail('invalid paths must not stop the proxy'),
        }),
      /TLS-Dateipfade/,
    );
    assert.equal(readTlsOperation(root), null);
  });
});

test('managed production and staging ACME use explicit public DNS; custom PEM does not', () => {
  const status = {
    ...emptyTlsStatus(),
    state: 'dns-verified' as const,
    mode: 'managed' as const,
    hostname: 'staff.test.lan.notaus.de',
    installationId: 'test',
  };
  for (const directory of ['production', 'staging']) {
    const env = new Map([['TLS_ACME_DIRECTORY', directory]]);
    assert.match(generateTlsCaddyfile(status, env), /resolvers 1\.1\.1\.1:53/);
    assert.doesNotMatch(generateTlsCaddyfile({ ...status, mode: 'custom' }, env), /resolvers /);
  }
});
