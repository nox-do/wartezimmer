import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { rebuildHost, type RebuildHooks } from './rebuild-host.js';
import { testSetupContext } from './test-setup-context.js';
import { DEFAULT_PORTAL_PROXY_CONTRACT } from '@wartezimmer/server-shared';

function fixture(t: test.TestContext, proxy = false) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rebuild-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const ctx = testSetupContext(home);
  fs.writeFileSync(path.join(home, 'docker-compose.yml'), 'services: {}');
  const env = `SETUP_LAN_APP_IP=192.168.1.10\nPROXY_ENABLED=${proxy}\nPROXY_MODE=${proxy ? 'http' : 'off'}\nAUTH_KEY_CAPTIVE=keep-this-secret\nUNKNOWN_SETTING=keep-me\n`;
  fs.writeFileSync(path.join(home, '.env'), env);
  const caddy = path.join(home, 'proxy/Caddyfile');
  fs.mkdirSync(path.dirname(caddy));
  fs.writeFileSync(caddy, ':80 { reverse_proxy app:8080 }\n');
  const calls: string[][] = [];
  let running = true;
  let missingImage = '';
  let upFails = false;
  let auditFails = false;
  let validateFails = false;
  const services = proxy ? ['app', 'sandbox', 'proxy'] : ['app', 'sandbox'];
  const status = {
    running: true,
    services: services.map((service) => ({
      name: service,
      service,
      state: 'running',
      health: 'healthy',
    })),
  };
  const config = {
    name: ctx.composeProjectName,
    services: Object.fromEntries(
      services.map((service) => [
        service,
        {
          image: `local/${service}:1`,
          volumes:
            service === 'proxy'
              ? [{ type: 'bind', source: caddy, target: '/etc/caddy/Caddyfile' }]
              : [{ type: 'volume', source: 'app_data', target: '/data' }],
        },
      ]),
    ),
    volumes: { app_data: { name: 'pf-test_app_data' } },
  };
  const hooks: RebuildHooks = {
    validateBindings: () => null,
    compose: async (options, args) => {
      calls.push(['compose', ...args]);
      if (args[0] === 'config')
        return { ok: true, log: '', stdout: JSON.stringify(config), stderr: '' };
      if (args[0] === 'ps')
        return {
          ok: true,
          log: '',
          stdout: JSON.stringify(
            services.map((Service) => ({ Service, State: running ? 'running' : 'exited' })),
          ),
          stderr: '',
        };
      if (args[0] === 'up') {
        const override = JSON.parse(fs.readFileSync(options.overrideFiles![0], 'utf8'));
        assert.match(override.services.app.image, /^sha256:/);
        assert.ok(args.includes('--no-build'));
        assert.equal(args[args.indexOf('--pull') + 1], 'never');
      }
      return { ok: !(upFails && args[0] === 'up'), log: 'test-command', stdout: '', stderr: '' };
    },
    docker: async (args) => {
      calls.push(args);
      if (args[0] === 'image')
        return {
          code: args.at(-1) === missingImage ? 1 : 0,
          stdout: `sha256:${'a'.repeat(64)}`,
          stderr: '',
        };
      if (args[0] === 'run')
        return { code: validateFails ? 1 : 0, stdout: '', stderr: 'validation' };
      return { code: 0, stdout: '', stderr: '' };
    },
    ps: async () => ({ ...status, running }),
    wait: async () => ({ ok: true, errors: [], compose: status }),
    audit: async () => ({ ok: !auditFails, errors: auditFails ? ['listener failed'] : [] }),
  };
  return {
    ctx,
    home,
    env,
    caddy,
    calls,
    hooks,
    config,
    stopped: () => {
      running = false;
    },
    missing: (image: string) => {
      missingImage = image;
    },
    failUp: () => {
      upFails = true;
    },
    failAudit: () => {
      auditFails = true;
    },
    failValidation: () => {
      validateFails = true;
    },
  };
}

test('missing or inconsistent env aborts before any Docker call or file modification', async (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.home, '.env'));
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /\.env fehlt/);
  assert.deepEqual(f.calls, []);
  fs.writeFileSync(path.join(f.home, '.env'), 'PROXY_ENABLED=true\nPROXY_MODE=off\n');
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /nicht ausreichend gültig/);
  assert.deepEqual(f.calls, []);
});

test('missing image aborts without changing files, validating Caddy or touching containers', async (t) => {
  const f = fixture(t, true);
  const before = fs.readFileSync(f.caddy);
  f.missing('local/sandbox:1');
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /Lokales Image für sandbox fehlt/);
  assert.ok(f.calls.every((args) => args[0] === 'image' || args[1] === 'config'));
  assert.ok(fs.readFileSync(f.caddy).equals(before));
  assert.equal(fs.readFileSync(path.join(f.home, '.env'), 'utf8'), f.env);
});

test('running stack is recreated offline and keeps env, secrets and user data byte-for-byte', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.home, 'patient-data'), 'preserve');
  const result = await rebuildHost(f.ctx, f.hooks);
  assert.equal(result.ok, true);
  assert.ok(f.calls.some((args) => args[1] === 'up'));
  assert.equal(fs.readFileSync(path.join(f.home, '.env'), 'utf8'), f.env);
  assert.equal(fs.readFileSync(path.join(f.home, 'patient-data'), 'utf8'), 'preserve');
});

test('stopped stack remains stopped and result explicitly says runtime is untested', async (t) => {
  const f = fixture(t, true);
  f.stopped();
  const result = await rebuildHost(f.ctx, f.hooks);
  assert.match(result.log, /Laufzeit noch nicht geprüft/);
  assert.ok(!f.calls.some((args) => args[1] === 'up' || args[1] === 'stop'));
  const validation = f.calls.find((args) => args[0] === 'run')!;
  assert.ok(validation.includes('--read-only'));
  assert.equal(validation[validation.indexOf('--network') + 1], 'none');
  assert.equal(validation[validation.indexOf('--pull') + 1], 'never');
});

for (const failure of ['up', 'audit'] as const) {
  test(`${failure} failure stops stack and restores previous Caddyfile`, async (t) => {
    const f = fixture(t, true);
    const before = fs.readFileSync(f.caddy);
    if (failure === 'up') f.failUp();
    else f.failAudit();
    await assert.rejects(rebuildHost(f.ctx, f.hooks), /Dienste wurden gestoppt/);
    assert.ok(f.calls.some((args) => args[1] === 'stop'));
    assert.ok(fs.readFileSync(f.caddy).equals(before));
    assert.equal(fs.readFileSync(path.join(f.home, '.env'), 'utf8'), f.env);
  });
}

test('failed Caddy validation does not touch existing runtime or Caddyfile', async (t) => {
  const f = fixture(t, true);
  const before = fs.readFileSync(f.caddy);
  f.failValidation();
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /Proxy-Konfiguration ist ungültig/);
  assert.ok(!f.calls.some((args) => args[1] === 'up' || args[1] === 'stop'));
  assert.ok(fs.readFileSync(f.caddy).equals(before));
});

test('open journal is rejected rather than recovered by rebuild', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.home, 'state/restricted-operation'), { recursive: true });
  fs.writeFileSync(
    path.join(f.home, 'state/restricted-operation/journal.json'),
    JSON.stringify({
      version: 1,
      id: 'pending',
      pid: 123,
      stackWasRunning: true,
      action: 'pending-apply',
      previousEnv: f.env,
      previousCaddyfile: null,
    }),
  );
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /Portaländerung ist noch offen/);
  assert.deepEqual(f.calls, []);
});

test('TLS cannot silently fall back to the Managers portal contract', async (t) => {
  const f = fixture(t, true);
  fs.appendFileSync(
    path.join(f.home, '.env'),
    'TLS_STATE=preparing\nTLS_MODE=managed\nTLS_HOSTNAME=staff.example.test\n',
  );
  f.config.services.proxy!.volumes![0].source = path.join(f.home, 'state/tls/Caddyfile');
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /Installierter Portalvertrag fehlt/);
  assert.ok(!fs.existsSync(path.join(f.home, 'state/tls')));
  assert.ok(!f.calls.some((args) => args[0] === 'run' || args[1] === 'up'));
});

test('TLS preparation regenerates from installed contract and preserves TLS files and identity', async (t) => {
  const f = fixture(t, true);
  const root = path.join(f.home, 'state/tls');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'portal-contract.json'),
    JSON.stringify(DEFAULT_PORTAL_PROXY_CONTRACT),
  );
  fs.writeFileSync(path.join(root, 'operator-token'), 'keep-token');
  const caddy = path.join(root, 'Caddyfile');
  f.config.services.proxy!.volumes![0].source = caddy;
  for (const [name, target] of [
    ['caddy-data', '/data'],
    ['caddy-config', '/config'],
    ['certs', '/certs'],
    ['acme-dns.json', '/run/secrets/acme-dns.json'],
  ]) {
    const source = path.join(root, name!);
    if (name!.endsWith('.json')) fs.writeFileSync(source, '{}');
    else fs.mkdirSync(source);
    f.config.services.proxy!.volumes!.push({ type: 'bind', source, target: target! });
  }
  fs.appendFileSync(
    path.join(f.home, '.env'),
    'TLS_STATE=preparing\nTLS_MODE=managed\nTLS_HOSTNAME=staff.example.test\nTLS_INSTALLATION_DOMAIN=example.test\nTLS_WILDCARD_CERTIFICATE_NAME=*.example.test\n',
  );
  const env = fs.readFileSync(path.join(f.home, '.env'));
  f.stopped();
  await rebuildHost(f.ctx, f.hooks);
  assert.match(fs.readFileSync(caddy, 'utf8'), /WARTEZIMMER-GENERATED/);
  assert.ok(fs.readFileSync(path.join(f.home, '.env')).equals(env));
  assert.equal(fs.readFileSync(path.join(root, 'operator-token'), 'utf8'), 'keep-token');
});

test('missing data volume aborts before Caddy validation or container changes', async (t) => {
  const f = fixture(t, true);
  const docker = f.hooks.docker!;
  f.hooks.docker = async (args, options) =>
    args[0] === 'volume' ? { code: 1, stdout: '', stderr: 'missing' } : docker(args, options);
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /Datenvolume/);
  assert.ok(!f.calls.some((args) => args[0] === 'run' || args[1] === 'up'));
});

test('failed runtime observation is not treated as a stopped stack', async (t) => {
  const f = fixture(t, true);
  const compose = f.hooks.compose!;
  f.hooks.compose = async (options, args) =>
    args[0] === 'ps' ? { ok: false, stdout: '', log: 'daemon down' } : compose(options, args);
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /Laufzustand konnte nicht ermittelt/);
  assert.ok(!f.calls.some((args) => args[0] === 'run' || args[1] === 'up'));
});

test('binding preflight aborts before any command', async (t) => {
  const f = fixture(t, true);
  f.hooks.validateBindings = () => 'Staff-IP fehlt am Rechner';
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /Staff-IP fehlt/);
  assert.deepEqual(f.calls, []);
});

function activeManagedTls(f: ReturnType<typeof fixture>) {
  const root = path.join(f.home, 'state/tls');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'portal-contract.json'),
    JSON.stringify(DEFAULT_PORTAL_PROXY_CONTRACT),
  );
  const volumes = f.config.services.proxy!.volumes!;
  volumes[0].source = path.join(root, 'Caddyfile');
  for (const [name, target] of [
    ['caddy-data', '/data'],
    ['caddy-config', '/config'],
    ['certs', '/certs'],
    ['acme-dns.json', '/run/secrets/acme-dns.json'],
  ]) {
    const source = path.join(root, name!);
    if (name!.endsWith('.json')) fs.writeFileSync(source, '{"keep":"credentials"}');
    else fs.mkdirSync(source);
    volumes.push({ type: 'bind', source, target: target! });
  }
  fs.appendFileSync(
    path.join(f.home, '.env'),
    'PROXY_MODE=tls-managed\nTLS_STATE=active\nTLS_MODE=managed\nTLS_CUTOVER_APPLIED=true\nTLS_STAFF_HOSTNAME=staff.example.test\nTLS_PORTAL_HOSTNAME=portal.example.test\nTLS_INSTALLATION_DOMAIN=example.test\nTLS_WILDCARD_CERTIFICATE_NAME=*.example.test\nSETUP_RESTRICTED_ENABLED=true\nSETUP_RESTRICTED_APP_IP=192.168.2.10\n',
  );
  return root;
}

test('active HTTPS refuses missing cached certificate instead of acquiring a replacement', async (t) => {
  const f = fixture(t, true);
  const root = activeManagedTls(f);
  await assert.rejects(rebuildHost(f.ctx, f.hooks), /kein neues Zertifikat wird angefordert/);
  assert.ok(!fs.existsSync(path.join(root, 'Caddyfile')));
  assert.ok(!f.calls.some((args) => args[0] === 'run' || args[1] === 'up'));
});

test('active portal rebuild preserves the actual certificate, key, credentials and identity and audits listeners', async (t) => {
  const f = fixture(t, true);
  const root = activeManagedTls(f);
  const cert = path.join(root, 'caddy-data/cached.crt');
  const key = path.join(root, 'caddy-data/cached.key');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=*.example.test',
      '-addext',
      'subjectAltName=DNS:*.example.test',
    ],
    { stdio: 'ignore' },
  );
  const protectedFiles = [
    cert,
    key,
    path.join(root, 'acme-dns.json'),
    path.join(root, 'portal-contract.json'),
    path.join(f.home, '.env'),
  ];
  const before = protectedFiles.map((file) => fs.readFileSync(file));
  let audited = false;
  f.hooks.audit = async (request) => {
    audited = true;
    assert.equal(request.restrictedEnabled, true);
    assert.equal(request.listeners?.portalHostname, 'portal.example.test');
    return { ok: true, errors: [] };
  };
  await rebuildHost(f.ctx, f.hooks);
  assert.equal(audited, true);
  for (const [index, file] of protectedFiles.entries())
    assert.ok(fs.readFileSync(file).equals(before[index]!));
  assert.match(fs.readFileSync(path.join(root, 'Caddyfile'), 'utf8'), /:444/);
});

test('unescaped dollar values abort before Docker and preserve env and files byte-for-byte', async (t) => {
  const f = fixture(t, true);
  const envPath = path.join(f.home, '.env');
  fs.appendFileSync(envPath, 'AUTH_KEY_CAPTIVE=keep$literal\n');
  const original = fs.readFileSync(envPath);
  const caddy = fs.readFileSync(f.caddy);
  await assert.rejects(rebuildHost(f.ctx, f.hooks), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /nicht maskierte Dollarzeichen/);
    assert.doesNotMatch(error.message, /keep\$literal/);
    return true;
  });
  assert.deepEqual(f.calls, []);
  assert.ok(fs.readFileSync(envPath).equals(original));
  assert.ok(fs.readFileSync(f.caddy).equals(caddy));
});

test('properly escaped dollar values remain accepted and unchanged', async (t) => {
  const f = fixture(t);
  const envPath = path.join(f.home, '.env');
  fs.appendFileSync(envPath, 'AUTH_KEY_CAPTIVE=keep$$literal\n');
  const original = fs.readFileSync(envPath);
  assert.equal((await rebuildHost(f.ctx, f.hooks)).ok, true);
  assert.ok(fs.readFileSync(envPath).equals(original));
});

test('failed cleanup reports the unresolved runtime explicitly', async (t) => {
  const f = fixture(t, true);
  f.failUp();
  const compose = f.hooks.compose!;
  f.hooks.compose = async (options, args) =>
    args[0] === 'stop' ? { ok: false, stdout: '', log: 'stop failed' } : compose(options, args);
  await assert.rejects(
    rebuildHost(f.ctx, f.hooks),
    /Dienste konnten nicht vollständig gestoppt werden; Laufzustand prüfen\.$/,
  );
});
