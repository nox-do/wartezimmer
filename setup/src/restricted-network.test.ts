import { restrictedOperationEnv } from './restricted-operation.js';
import type { ComposeRunOptions } from './docker.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ManagerApiError,
  type NetworkInterfaceInfo,
  type TlsStatus,
} from '@wartezimmer/server-shared';
import {
  buildRestrictedNetworkCandidates,
  buildRestrictedNetworkInspect,
  buildRestrictedNetworkStatus,
} from './restricted-network.js';
import {
  applyRestrictedNetwork,
  prepareRestrictedNetwork,
  removeRestrictedNetwork,
} from './host-state.js';
import { readEnvMap } from './env-file.js';

const interfaces: NetworkInterfaceInfo[] = [
  {
    name: 'lo0',
    addresses: [{ family: 'IPv4', address: '127.0.0.1', internal: true, cidr: '127.0.0.1/8' }],
  },
  {
    name: 'en0',
    addresses: [
      {
        family: 'IPv4',
        address: '192.168.10.10',
        internal: false,
        cidr: '192.168.10.10/24',
        mac: 'aa:00:00:00:00:01',
      },
      {
        family: 'IPv4',
        address: '192.168.10.11',
        internal: false,
        cidr: '192.168.10.11/24',
        mac: 'aa:00:00:00:00:01',
      },
    ],
  },
  {
    name: 'en7',
    addresses: [
      {
        family: 'IPv4',
        address: '10.20.0.2',
        internal: false,
        cidr: '10.20.0.2/24',
        mac: 'aa:00:00:00:00:07',
      },
    ],
  },
  {
    name: 'utun4',
    addresses: [{ family: 'IPv4', address: '100.64.0.2', internal: false, cidr: '100.64.0.2/24' }],
  },
  {
    name: 'en8',
    addresses: [
      { family: 'IPv4', address: '169.254.4.2', internal: false, cidr: '169.254.4.2/16' },
    ],
  },
];

const tls: TlsStatus = {
  state: 'active',
  mode: 'managed',
  hostname: 'staff.installation.example',
  staffHostname: 'staff.installation.example',
  portalHostname: 'portal.installation.example',
  wildcardCertificateName: '*.installation.example',
  installationId: 'installation',
  tokenConsumed: true,
  applyReady: false,
  cutoverApplied: true,
  certificate: {
    issuer: 'Test CA',
    notBefore: '2026-01-01T00:00:00Z',
    notAfter: '2027-01-01T00:00:00Z',
    names: ['*.installation.example'],
  },
  lastError: null,
  acmeCnameTarget: null,
};

test('candidate discovery excludes only hard-invalid addresses and keeps warned adapters', () => {
  const candidates = buildRestrictedNetworkCandidates(interfaces, '192.168.10.10');
  assert.deepEqual(
    candidates.map((candidate) => candidate.address),
    ['192.168.10.11', '10.20.0.2', '100.64.0.2'],
  );
  assert.deepEqual(candidates[0]?.warnings, ['same-interface']);
  assert.deepEqual(candidates[1]?.warnings, []);
  assert.deepEqual(candidates[2]?.warnings, ['virtual-interface']);
});

test('configured restricted binding remains prepared until the exact proxy publish exists', () => {
  const env = new Map([['SETUP_RESTRICTED_APP_IP', '10.20.0.2']]);
  const prepared = buildRestrictedNetworkStatus({
    env,
    interfaces,
    staffIp: '192.168.10.10',
    tls,
    compose: null,
    platform: 'darwin',
  });
  assert.equal(prepared.phase, 'prepared');
  assert.equal(prepared.health, 'prepared');

  const applied = buildRestrictedNetworkStatus({
    env: new Map([...env, ['SETUP_RESTRICTED_ENABLED', 'true']]),
    interfaces,
    staffIp: '192.168.10.10',
    tls,
    platform: 'darwin',
    compose: {
      running: true,
      services: [
        {
          name: 'proxy',
          service: 'proxy',
          state: 'running',
          health: 'healthy',
          publishedBindings: [
            { hostIp: '10.20.0.2', publishedPort: 443, targetPort: 444, protocol: 'tcp' },
          ],
        },
      ],
    },
  });
  assert.equal(applied.phase, 'applied');
  assert.equal(applied.health, 'healthy');

  const unobserved = buildRestrictedNetworkStatus({
    env: new Map([...env, ['SETUP_RESTRICTED_ENABLED', 'true']]),
    interfaces,
    staffIp: '192.168.10.10',
    tls,
    platform: 'darwin',
    compose: null,
  });
  assert.equal(unobserved.phase, 'applied');
  assert.equal(unobserved.health, null);
  assert.deepEqual(unobserved.binding, applied.binding);
});

test('inspect verifies the portal A record and HTTPS coverage', async () => {
  const result = await buildRestrictedNetworkInspect({
    env: new Map([['SETUP_RESTRICTED_APP_IP', '10.20.0.2']]),
    interfaces,
    staffIp: '192.168.10.10',
    tls,
    compose: null,
    platform: 'darwin',
    resolve4: async () => ['10.20.0.2'],
    resolvePublic4: async () => ['10.20.0.2'],
  });
  assert.equal(result.dns.state, 'match');
  assert.equal(result.checks.find((check) => check.id === 'restricted.tls')?.ok, true);
  assert.equal(
    result.checks.find((check) => check.id === 'restricted.portal-dns-public')?.ok,
    true,
  );
  assert.equal(result.checks.find((check) => check.id === 'restricted.portal-dns-local')?.ok, true);
  assert.match(result.externalResponsibilities.join(' '), /Host-Firewall/);
});

test('missing portal DNS explains operator and custom-domain responsibility', async () => {
  const managed = await buildRestrictedNetworkInspect({
    env: new Map([['SETUP_RESTRICTED_APP_IP', '10.20.0.2']]),
    interfaces,
    staffIp: '192.168.10.10',
    tls: { ...tls, portalHostname: 'portal.installation.lan.notaus.de' },
    compose: null,
    platform: 'darwin',
    resolve4: async () => [],
    resolvePublic4: async () => [],
  });
  assert.match(
    managed.checks.find((check) => check.id === 'restricted.portal-dns-public')?.detail ?? '',
    /Betreiber/,
  );
  assert.equal(managed.status.health, 'blocked');

  const custom = await buildRestrictedNetworkInspect({
    env: new Map([['SETUP_RESTRICTED_APP_IP', '10.20.0.2']]),
    interfaces,
    staffIp: '192.168.10.10',
    tls,
    compose: null,
    platform: 'darwin',
    resolve4: async () => [],
    resolvePublic4: async () => [],
  });
  assert.match(
    custom.checks.find((check) => check.id === 'restricted.portal-dns-public')?.detail ?? '',
    /eigenen DNS-Zone/,
  );
});

test('public portal record with failed local resolution reports a rebind or cache suspicion', async () => {
  const result = await buildRestrictedNetworkInspect({
    env: new Map([['SETUP_RESTRICTED_APP_IP', '10.20.0.2']]),
    interfaces,
    staffIp: '192.168.10.10',
    tls: { ...tls, portalHostname: 'portal.installation.lan.notaus.de' },
    compose: null,
    platform: 'darwin',
    resolve4: async () => [],
    resolvePublic4: async () => ['10.20.0.2'],
  });

  assert.equal(result.dns.state, 'local-unresolved');
  assert.equal(result.dns.reason, 'dns-rebind');
  assert.equal(
    result.checks.find((check) => check.id === 'restricted.portal-dns-public')?.ok,
    true,
  );
  const localCheck = result.checks.find((check) => check.id === 'restricted.portal-dns-local');
  assert.equal(localCheck?.ok, false);
  assert.match(localCheck?.message ?? '', /DNS-Rebind-Schutz/);
  assert.match(localCheck?.detail ?? '', /lan\.notaus\.de/);
  assert.equal(result.status.health, 'blocked');
});

test('portal DNS rejects answer sets containing any additional target', async () => {
  const result = await buildRestrictedNetworkInspect({
    env: new Map([['SETUP_RESTRICTED_APP_IP', '10.20.0.2']]),
    interfaces,
    staffIp: '192.168.10.10',
    tls,
    compose: null,
    platform: 'darwin',
    resolve4: async () => ['10.20.0.2', '192.168.10.10'],
    resolvePublic4: async () => ['10.20.0.2', '203.0.113.10'],
  });

  assert.equal(result.dns.state, 'mismatch');
  assert.equal(
    result.checks.find((check) => check.id === 'restricted.portal-dns-public')?.ok,
    false,
  );
  assert.equal(
    result.checks.find((check) => check.id === 'restricted.portal-dns-local')?.ok,
    false,
  );
});

test('duplicate local addresses remain visible but cannot be prepared as unambiguous bindings', async () => {
  const duplicateInterfaces: NetworkInterfaceInfo[] = [
    ...interfaces,
    {
      name: 'en9',
      addresses: [
        {
          family: 'IPv4',
          address: '10.20.0.2',
          internal: false,
          cidr: '10.20.0.2/24',
          mac: 'aa:00:00:00:00:09',
        },
      ],
    },
  ];
  const duplicateCandidates = buildRestrictedNetworkCandidates(
    duplicateInterfaces,
    '192.168.10.10',
  ).filter((candidate) => candidate.address === '10.20.0.2');
  assert.equal(duplicateCandidates.length, 2);
  assert.ok(
    duplicateCandidates.every((candidate) => candidate.warnings.includes('ambiguous-address')),
  );

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restricted-ambiguous-'));
  fs.writeFileSync(path.join(home, '.env'), 'SETUP_LAN_APP_IP=192.168.10.10\n');
  try {
    await assert.rejects(
      () =>
        prepareRestrictedNetwork(
          {
            home,
            mode: 'install',
            composeProjectName: 'pf-test',
            templateRoot: home,
          },
          {
            hostIp: '10.20.0.2',
            interfaceId: duplicateCandidates[0]!.interfaceId,
            warningsConfirmed: true,
          },
          { interfaces: duplicateInterfaces, platform: 'darwin', tls },
        ),
      (error: unknown) =>
        error instanceof ManagerApiError && error.code === 'restricted_address_ambiguous',
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('inspect degrades an applied binding when the proxy also has a global publish', async () => {
  const result = await buildRestrictedNetworkInspect({
    env: new Map([
      ['SETUP_RESTRICTED_APP_IP', '10.20.0.2'],
      ['SETUP_RESTRICTED_ENABLED', 'true'],
    ]),
    interfaces,
    staffIp: '192.168.10.10',
    tls,
    platform: 'darwin',
    resolve4: async () => ['10.20.0.2'],
    resolvePublic4: async () => ['10.20.0.2'],
    compose: {
      running: true,
      services: [
        {
          name: 'proxy',
          service: 'proxy',
          state: 'running',
          health: 'healthy',
          publishedBindings: [
            { hostIp: '10.20.0.2', publishedPort: 443, targetPort: 444, protocol: 'tcp' },
            { hostIp: '0.0.0.0', publishedPort: 8443, targetPort: 444, protocol: 'tcp' },
          ],
        },
      ],
    },
  });
  assert.equal(result.status.phase, 'applied');
  assert.equal(result.status.health, 'degraded');
  assert.equal(
    result.checks.find((check) => check.id === 'restricted.binding.no-global-publish')?.ok,
    false,
  );
});

test('unsupported platforms are reported without hiding otherwise valid candidates', async () => {
  const result = await buildRestrictedNetworkInspect({
    env: new Map(),
    interfaces,
    staffIp: '192.168.10.10',
    tls,
    compose: null,
    platform: 'linux',
  });
  assert.equal(result.capabilities.supported, false);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.checks.find((check) => check.id === 'restricted.platform')?.ok, false);
});

test('custom TLS is not advertised as a prepared dedicated portal identity', async () => {
  const result = await buildRestrictedNetworkInspect({
    env: new Map([['SETUP_RESTRICTED_APP_IP', '10.20.0.2']]),
    interfaces,
    staffIp: '192.168.10.10',
    tls: {
      ...tls,
      mode: 'custom',
      wildcardCertificateName: null,
    },
    compose: null,
    platform: 'darwin',
  });
  const tlsCheck = result.checks.find((check) => check.id === 'restricted.tls');
  assert.equal(tlsCheck?.ok, false);
  assert.match(tlsCheck?.message ?? '', /automatisch verwaltetes Zertifikat/);
});

test('prepare persists the exact local IP/interface choice and then returns DNS inspect', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restricted-prepare-'));
  const envPath = path.join(home, '.env');
  fs.writeFileSync(envPath, 'SETUP_LAN_APP_IP=192.168.10.10\n');
  const ctx = {
    home,
    mode: 'install' as const,
    composeProjectName: 'pf-test',
    templateRoot: home,
  };
  try {
    const selected = buildRestrictedNetworkCandidates(interfaces, '192.168.10.10').find(
      (candidate) => candidate.address === '10.20.0.2',
    );
    assert.ok(selected);
    const result = await prepareRestrictedNetwork(
      ctx,
      {
        hostIp: selected.address,
        interfaceId: selected.interfaceId,
        warningsConfirmed: false,
      },
      {
        interfaces,
        platform: 'win32',
        tls,
        inspect: () =>
          buildRestrictedNetworkInspect({
            env: readEnvMap(envPath),
            interfaces,
            staffIp: '192.168.10.10',
            tls,
            compose: null,
            platform: 'darwin',
            resolve4: async () => ['10.20.0.2'],
            resolvePublic4: async () => ['10.20.0.2'],
          }),
      },
    );
    const env = readEnvMap(envPath);
    assert.equal(env.get('SETUP_RESTRICTED_APP_IP'), '10.20.0.2');
    assert.equal(env.get('SETUP_RESTRICTED_INTERFACE_ID'), selected.interfaceId);
    assert.equal(env.get('SETUP_RESTRICTED_WARNINGS_CONFIRMED'), 'false');
    assert.equal(result.status.phase, 'prepared');
    assert.equal(result.dns.state, 'match');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('prepare requires confirmation for a warned but selectable candidate', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restricted-warning-'));
  fs.writeFileSync(path.join(home, '.env'), 'SETUP_LAN_APP_IP=192.168.10.10\n');
  const selected = buildRestrictedNetworkCandidates(interfaces, '192.168.10.10').find(
    (candidate) => candidate.address === '192.168.10.11',
  );
  assert.ok(selected);
  try {
    await assert.rejects(
      () =>
        prepareRestrictedNetwork(
          {
            home,
            mode: 'install',
            composeProjectName: 'pf-test',
            templateRoot: home,
          },
          {
            hostIp: selected.address,
            interfaceId: selected.interfaceId,
            warningsConfirmed: false,
          },
          { interfaces, platform: 'darwin', tls },
        ),
      /bestätigt/,
    );
    assert.equal(readEnvMap(path.join(home, '.env')).has('SETUP_RESTRICTED_APP_IP'), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

function restrictedRuntimeCompose(env: Map<string, string>) {
  const restricted = env.get('SETUP_RESTRICTED_ENABLED') === 'true';
  return {
    running: true,
    services: [
      {
        name: 'app',
        service: 'app',
        state: 'running',
        health: 'healthy',
        publishedBindings: [
          { hostIp: '127.0.0.1', publishedPort: 8080, targetPort: 8080, protocol: 'tcp' },
          { hostIp: '127.0.0.1', publishedPort: 8082, targetPort: 8082, protocol: 'tcp' },
        ],
      },
      {
        name: 'sandbox',
        service: 'sandbox',
        state: 'running',
        health: 'healthy',
        publishedBindings: [],
      },
      {
        name: 'proxy',
        service: 'proxy',
        state: 'running',
        health: 'healthy',
        publishedBindings: [
          { hostIp: '192.168.10.10', publishedPort: 80, targetPort: 80, protocol: 'tcp' },
          { hostIp: '192.168.10.10', publishedPort: 443, targetPort: 443, protocol: 'tcp' },
          ...(restricted
            ? [{ hostIp: '10.20.0.2', publishedPort: 443, targetPort: 444, protocol: 'tcp' }]
            : []),
        ],
      },
    ],
  };
}

function restrictedMutationFixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restricted-mutation-'));
  const envPath = path.join(home, '.env');
  fs.writeFileSync(
    envPath,
    [
      'SETUP_LAN_APP_IP=192.168.10.10',
      'APP_BIND_ADDRESS=127.0.0.1',
      'PROXY_ENABLED=true',
      'PROXY_MODE=tls-managed',
      'TLS_STATE=active',
      'TLS_MODE=managed',
      'TLS_HOSTNAME=staff.installation.example',
      'TLS_INSTALLATION_DOMAIN=installation.example',
      'TLS_CUTOVER_APPLIED=true',
      'TLS_STAFF_HOSTNAME=staff.installation.example',
      'TLS_PORTAL_HOSTNAME=portal.installation.example',
      'TLS_WILDCARD_CERTIFICATE_NAME=*.installation.example',
      'TLS_CERT_ISSUER=Test CA',
      'TLS_CERT_NOT_BEFORE=2026-01-01T00:00:00Z',
      'TLS_CERT_NOT_AFTER=2027-01-01T00:00:00Z',
      'TLS_CERT_NAMES=["*.installation.example"]',
      'SETUP_RESTRICTED_APP_IP=10.20.0.2',
      'SETUP_RESTRICTED_INTERFACE_ID=mac:aa:00:00:00:00:07',
      'SETUP_RESTRICTED_WARNINGS_CONFIRMED=false',
      'SETUP_RESTRICTED_SAME_INTERFACE_CONFIRMED=false',
      '',
    ].join('\n'),
  );
  const inspect = () => {
    const env = readEnvMap(envPath);
    return buildRestrictedNetworkInspect({
      env,
      interfaces,
      staffIp: '192.168.10.10',
      tls,
      compose: restrictedRuntimeCompose(env),
      platform: 'darwin',
      resolve4: async () => ['10.20.0.2'],
      resolvePublic4: async () => ['10.20.0.2'],
    });
  };
  const hooks = {
    inspect,
    composePs: async (options: ComposeRunOptions) =>
      restrictedRuntimeCompose(
        readEnvMap(restrictedOperationEnv(options.projectRoot, options.restrictedOperationId)),
      ),
    composeRemoveServices: async () => ({ ok: true, log: 'removed' }),
    composeStop: async () => ({ ok: true, log: 'stopped' }),
    composeUp: async () => ({ ok: true, log: 'started', gatewaySkipped: false }),
    composeValidateConfig: async () => ({ ok: true, log: '' }),
    composeExec: async () => ({ ok: true, log: 'valid' }),
    ensureProxyImageAvailable: async () => ({ imageRef: 'proxy:test' }),
    validateStaffIp: () => null,
    auditListeners: async () => null,
    restoreProxyRestartPolicy: async () => undefined,
    stackHealthWaitOptions: { timeoutMs: 10, intervalMs: 0 },
  };
  return { home, envPath, inspect, hooks };
}

test('apply and remove switch the restricted overlay transactionally', async () => {
  const fixture = restrictedMutationFixture();
  const ctx = {
    home: fixture.home,
    mode: 'install' as const,
    composeProjectName: 'pf-test',
    templateRoot: fixture.home,
  };
  try {
    const applied = await applyRestrictedNetwork(ctx, fixture.hooks);
    assert.equal(applied.status.phase, 'applied');
    assert.equal(applied.status.health, 'healthy');
    assert.equal(readEnvMap(fixture.envPath).get('SETUP_RESTRICTED_ENABLED'), 'true');
    const generatedCaddyfile = fs.readFileSync(
      path.join(fixture.home, 'state', 'tls', 'Caddyfile'),
      'utf8',
    );
    assert.match(generatedCaddyfile, /^# WARTEZIMMER-GENERATED LAN-TLS v6/m);
    assert.match(generatedCaddyfile, /:444 \{/);

    const removed = await removeRestrictedNetwork(ctx, fixture.hooks);
    assert.equal(removed.status.phase, 'unconfigured');
    assert.doesNotMatch(
      fs.readFileSync(path.join(fixture.home, 'state/tls/Caddyfile'), 'utf8'),
      /:444 \{/,
    );
    assert.match(
      fs.readFileSync(path.join(fixture.home, 'state/tls/Caddyfile'), 'utf8'),
      /host staff\.installation\.example/,
    );
    const env = readEnvMap(fixture.envPath);
    assert.equal(env.has('SETUP_RESTRICTED_ENABLED'), false);
    assert.equal(env.has('SETUP_RESTRICTED_APP_IP'), false);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('failed restricted apply restores the prepared env', async () => {
  const fixture = restrictedMutationFixture();
  const ctx = {
    home: fixture.home,
    mode: 'install' as const,
    composeProjectName: 'pf-test',
    templateRoot: fixture.home,
  };
  let upCalls = 0;
  try {
    await assert.rejects(
      () =>
        applyRestrictedNetwork(ctx, {
          ...fixture.hooks,
          composeUp: async () =>
            ++upCalls === 1
              ? { ok: false, log: 'bind failed', gatewaySkipped: false }
              : { ok: true, log: 'restored', gatewaySkipped: false },
        }),
      /vorherige Patientenzugang wurde wiederhergestellt/,
    );
    assert.equal(readEnvMap(fixture.envPath).has('SETUP_RESTRICTED_ENABLED'), false);
    assert.equal(readEnvMap(fixture.envPath).get('SETUP_RESTRICTED_APP_IP'), '10.20.0.2');
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('failed restricted apply does not claim restoration when the rollback binding audit fails', async () => {
  const fixture = restrictedMutationFixture();
  const ctx = {
    home: fixture.home,
    mode: 'install' as const,
    composeProjectName: 'pf-test',
    templateRoot: fixture.home,
  };
  let upCalls = 0;
  try {
    await assert.rejects(
      () =>
        applyRestrictedNetwork(ctx, {
          ...fixture.hooks,
          composeUp: async () =>
            ++upCalls === 1
              ? { ok: false, log: 'bind failed', gatewaySkipped: false }
              : { ok: true, log: 'restored', gatewaySkipped: false },
          auditStaffBindings: () => [
            {
              id: 'staff.binding.proxy',
              ok: false,
              message: 'Proxy besitzt unerwartete Host-Bindings',
              detail: 'unerwarteter globaler Publish',
            },
          ],
        }),
      /Rollback unvollständig/,
    );
    assert.equal(readEnvMap(fixture.envPath).has('SETUP_RESTRICTED_ENABLED'), false);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('failed listener audit rolls restricted apply back', async () => {
  const fixture = restrictedMutationFixture();
  const ctx = {
    home: fixture.home,
    mode: 'install' as const,
    composeProjectName: 'pf-test',
    templateRoot: fixture.home,
  };
  try {
    await assert.rejects(
      () =>
        applyRestrictedNetwork(ctx, {
          ...fixture.hooks,
          auditListeners: async () => 'Staff-Hostname wird auf der Restricted-IP akzeptiert',
        }),
      /vorherige Patientenzugang wurde wiederhergestellt/,
    );
    assert.equal(readEnvMap(fixture.envPath).has('SETUP_RESTRICTED_ENABLED'), false);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('unexpected compose exception rolls restricted apply and generated Caddyfile back', async () => {
  const fixture = restrictedMutationFixture();
  const ctx = {
    home: fixture.home,
    mode: 'install' as const,
    composeProjectName: 'pf-test',
    templateRoot: fixture.home,
  };
  const caddyfile = path.join(fixture.home, 'state', 'tls', 'Caddyfile');
  fs.mkdirSync(path.dirname(caddyfile), { recursive: true });
  fs.writeFileSync(caddyfile, '# WARTEZIMMER-GENERATED LAN-TLS v2\nold-contract\n');
  let removeCalls = 0;
  try {
    await assert.rejects(
      () =>
        applyRestrictedNetwork(ctx, {
          ...fixture.hooks,
          composeRemoveServices: async () => {
            removeCalls += 1;
            if (removeCalls === 1) throw new Error('docker transport lost');
            return { ok: true, log: 'rollback cleanup' };
          },
        }),
      /vorherige Patientenzugang wurde wiederhergestellt/,
    );
    assert.equal(readEnvMap(fixture.envPath).has('SETUP_RESTRICTED_ENABLED'), false);
    assert.equal(
      fs.readFileSync(caddyfile, 'utf8'),
      '# WARTEZIMMER-GENERATED LAN-TLS v2\nold-contract\n',
    );
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('remove clears an active restricted target while the stack is stopped', async () => {
  const fixture = restrictedMutationFixture();
  const ctx = {
    home: fixture.home,
    mode: 'install' as const,
    composeProjectName: 'pf-test',
    templateRoot: fixture.home,
  };
  fs.appendFileSync(fixture.envPath, 'SETUP_RESTRICTED_ENABLED=true\n');
  let upCalls = 0;
  try {
    const removed = await removeRestrictedNetwork(ctx, {
      ...fixture.hooks,
      composePs: async () => ({ running: false, services: [] }),
      composeExec: async (options) => {
        assert.equal(options.oneOff, true);
        return { ok: true, log: 'valid' };
      },
      composeUp: async () => {
        upCalls += 1;
        return { ok: true, log: 'unexpected', gatewaySkipped: false };
      },
      validateStaffIp: () => 'Staff-IP is currently absent',
      ensureProxyImageAvailable: async () => {
        throw new Error('image lookup must not run for stopped remove');
      },
    });

    assert.equal(removed.status.phase, 'unconfigured');
    assert.doesNotMatch(
      fs.readFileSync(path.join(fixture.home, 'state/tls/Caddyfile'), 'utf8'),
      /:444 \{/,
    );
    assert.match(
      fs.readFileSync(path.join(fixture.home, 'state/tls/Caddyfile'), 'utf8'),
      /host staff\.installation\.example/,
    );
    assert.equal(upCalls, 0);
    const env = readEnvMap(fixture.envPath);
    assert.equal(env.has('SETUP_RESTRICTED_ENABLED'), false);
    assert.equal(env.has('SETUP_RESTRICTED_APP_IP'), false);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('failed remove validation preserves both active env and Caddyfile', async () => {
  const fixture = restrictedMutationFixture();
  const ctx = {
    home: fixture.home,
    mode: 'install' as const,
    composeProjectName: 'pf-test',
    templateRoot: fixture.home,
  };
  try {
    await applyRestrictedNetwork(ctx, fixture.hooks);
    const file = path.join(fixture.home, 'state/tls/Caddyfile');
    const oldConfig = fs.readFileSync(file, 'utf8');
    const oldEnv = fs.readFileSync(fixture.envPath, 'utf8');
    await assert.rejects(
      () =>
        removeRestrictedNetwork(ctx, {
          ...fixture.hooks,
          composeExec: async () => {
            assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /:444 \{/);
            return { ok: false, log: 'validation failed' };
          },
          composeRemoveServices: async () => {
            throw new Error('must not mutate runtime');
          },
        }),
      /Proxy-Konfiguration ist ungültig/,
    );
    assert.equal(fs.readFileSync(file, 'utf8'), oldConfig);
    assert.equal(fs.readFileSync(fixture.envPath, 'utf8'), oldEnv);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('apply commits the active marker only after listener audit', async () => {
  const fixture = restrictedMutationFixture();
  try {
    let audited = false;
    await applyRestrictedNetwork(
      {
        home: fixture.home,
        mode: 'install',
        composeProjectName: 'test',
        templateRoot: fixture.home,
      },
      {
        ...fixture.hooks,
        auditListeners: async () => {
          assert.notEqual(readEnvMap(fixture.envPath).get('SETUP_RESTRICTED_ENABLED'), 'true');
          assert.equal(
            fs.existsSync(path.join(fixture.home, 'state/restricted-operation/journal.json')),
            true,
          );
          audited = true;
          return null;
        },
        restoreProxyRestartPolicy: async () => {
          assert.equal(audited, true);
          assert.equal(readEnvMap(fixture.envPath).get('SETUP_RESTRICTED_ENABLED'), 'true');
        },
      },
    );
    assert.equal(fs.existsSync(path.join(fixture.home, 'state/restricted-operation')), false);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

for (const listenerFailure of [false, true])
  test(`failed remove audits the restored active listener and retains recovery on failure: ${listenerFailure}`, async () => {
    const fixture = restrictedMutationFixture();
    let starts = 0;
    let removals = 0;
    let audits = 0;
    try {
      fs.appendFileSync(fixture.envPath, 'SETUP_RESTRICTED_ENABLED=true\n');
      await assert.rejects(
        () =>
          removeRestrictedNetwork(
            {
              home: fixture.home,
              mode: 'install',
              composeProjectName: 'test',
              templateRoot: fixture.home,
            },
            {
              ...fixture.hooks,
              composeUp: async () => ({
                ok: ++starts !== 1,
                log: 'restart failed',
                gatewaySkipped: false,
              }),
              composeRemoveServices: async () => {
                removals++;
                return { ok: true, log: '' };
              },
              auditListeners: async () => {
                audits++;
                return listenerFailure ? 'unsafe restored listener' : null;
              },
            },
          ),
        listenerFailure
          ? /Rollback unvollständig/
          : /vorherige Patientenzugang wurde wiederhergestellt/,
      );
      assert.equal(audits, 1);
      assert.equal(removals, listenerFailure ? 3 : 2);
      assert.equal(
        fs.existsSync(path.join(fixture.home, 'state/restricted-operation/journal.json')),
        listenerFailure,
      );
    } finally {
      fs.rmSync(fixture.home, { recursive: true, force: true });
    }
  });

for (const platform of ['darwin', 'win32']) {
  test(`${platform} supports restricted access while retaining TLS prerequisites`, async () => {
    const result = await buildRestrictedNetworkInspect({
      env: new Map(),
      interfaces,
      staffIp: '192.168.10.10',
      tls,
      compose: null,
      platform,
    });
    assert.equal(result.capabilities.supported, true);
    assert.equal(result.checks.find((check) => check.id === 'restricted.platform')?.ok, true);
    if (platform === 'win32')
      assert.match(result.capabilities.message, /unter Windows unterstützt/);
  });
}
