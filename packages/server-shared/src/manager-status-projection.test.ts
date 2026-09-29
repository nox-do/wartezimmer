import assert from 'node:assert/strict';
import test from 'node:test';
import { projectManagerStatus } from './manager-status-projection.js';
import type {
  HostRuntimeHealth,
  InstallationState,
  RuntimeObservation,
  TlsStatus,
} from './setup-api.js';

type Config = NonNullable<Parameters<typeof projectManagerStatus>[0]>;
const service = (name: string, health = 'healthy', state = 'running') => ({
  name,
  service: name,
  state,
  health,
});
function config(overrides: Partial<Config> = {}): Config {
  return {
    installation: { kind: 'healthy', updateEligible: true },
    lifecycle: {
      assessment: 'known',
      mode: 'proxy-http',
      operation: 'none',
      preparation: 'none',
      recovery: 'none',
      issues: [],
    },
    network: { configuredLanIp: '192.168.1.2', lanIpStale: false, currentLanCandidates: [] },
    networkBindings: [],
    ...overrides,
  };
}
function current(overrides: Partial<HostRuntimeHealth> = {}): RuntimeObservation {
  return {
    kind: 'current',
    snapshot: {
      checkedAt: '2026-09-28T12:00:00Z',
      envExists: true,
      configuredLanIp: '192.168.1.2',
      appBaseUrl: null,
      docker: { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
      compose: { running: true, services: [service('app'), service('sandbox')] },
      probes: [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: true, message: 'ok' },
      ],
      sandboxScanner: null,
      proxyServer: { enabled: true, container: service('proxy') },
      ...overrides,
    },
  };
}
const error = {
  code: 'offline',
  category: 'unavailable',
  retryable: true,
  message: 'offline',
} as const;
const operation = {
  id: 'install',
  mode: 'fresh',
  phase: 'installing',
  createdAt: '',
  releaseVersion: '1',
  backupContainsTls: null,
} as const;
const broken = current({ proxyServer: { enabled: true, container: null } });
const tls = (state: TlsStatus['state']): TlsStatus => ({
  state,
  mode: 'managed',
  hostname: 'staff.example',
  installationId: 'id',
  tokenConsumed: true,
  applyReady: false,
  cutoverApplied: false,
  certificate: null,
  lastError: null,
  acmeCnameTarget: null,
});
const cases: Array<[string, Config, RuntimeObservation, string, string]> = [
  [
    'open install beats runtime',
    config({ installation: { kind: 'installing', operation } }),
    broken,
    'installation-open',
    'continue-operation',
  ],
  [
    'open install survives Docker gap',
    config({ installation: { kind: 'installing', operation } }),
    { kind: 'unavailable', error, failedAt: '' },
    'installation-open',
    'continue-operation',
  ],
  [
    'open portal beats runtime',
    config({ lifecycle: { ...config().lifecycle!, operation: 'portal-apply' } }),
    broken,
    'portal-open',
    'continue-operation',
  ],
  [
    'unreadable install journal',
    config({
      installation: {
        kind: 'inconsistent',
        reasons: [{ code: 'install-operation-invalid', message: 'invalid' }],
      },
    }),
    broken,
    'operation-unreadable',
    'inspect-configuration',
  ],
  [
    'unreadable portal journal',
    config({ lifecycle: { ...config().lifecycle!, operation: 'unreadable' } }),
    broken,
    'operation-unreadable',
    'inspect-configuration',
  ],
  [
    'inconsistent beats idle',
    config({ installation: { kind: 'inconsistent', reasons: [] } }),
    { kind: 'idle' },
    'installation-inconsistent',
    'inspect-configuration',
  ],
  [
    'unknown never guesses a mode',
    config({ lifecycle: { ...config().lifecycle!, assessment: 'unknown', mode: null } }),
    current(),
    'configuration-unknown',
    'inspect-configuration',
  ],
  [
    'fresh offers setup',
    config({
      installation: { kind: 'fresh' },
      lifecycle: { ...config().lifecycle!, mode: 'uninstalled' },
    }),
    { kind: 'idle' },
    'installation-fresh',
    'install',
  ],
  [
    'missing substance',
    config({ installation: { kind: 'needs-reinstall', reasons: [] } }),
    current(),
    'installation-reinstall',
    'reinstall',
  ],
  [
    'repair',
    config({ installation: { kind: 'needs-repair', reasons: [] } }),
    current(),
    'installation-repair',
    'repair',
  ],
  [
    'LAN failure beats healthy',
    config(),
    current({ probes: [{ id: 'app.health.lan', ok: false, message: 'failure' }] }),
    'lan-unreachable',
    'repair',
  ],
  ['proxy failure beats healthy', config(), broken, 'proxy-unavailable', 'repair'],
  [
    'stale',
    config(),
    {
      kind: 'stale',
      snapshot: (current() as Extract<RuntimeObservation, { kind: 'current' }>).snapshot,
      error,
      failedAt: '',
    },
    'observation-stale',
    'retry-observation',
  ],
  [
    'unavailable',
    config(),
    { kind: 'unavailable', error, failedAt: '' },
    'observation-unavailable',
    'retry-observation',
  ],
  ['idle', config(), { kind: 'idle' }, 'observation-idle', 'wait'],
  [
    'starting beats saved stopped',
    config({ installation: { kind: 'stopped' } }),
    current({
      compose: { running: false, services: [service('app', 'starting'), service('sandbox')] },
      probes: [],
    }),
    'runtime-starting',
    'wait',
  ],
  [
    'confirmed stopped',
    config(),
    current({ compose: { running: false, services: [] }, probes: [] }),
    'runtime-stopped',
    'start',
  ],
  ['healthy', config(), current(), 'runtime-healthy', 'none'],
  [
    'TLS preparation beats runtime warning',
    config({ tls: tls('preparing') }),
    broken,
    'tls-preparing',
    'wait',
  ],
  [
    'TLS action beats runtime warning',
    config({ tls: tls('awaiting-operator-dns') }),
    broken,
    'tls-action',
    'continue-operation',
  ],
  [
    'missing LAN address',
    config({ network: { ...config().network, lanIpStale: true } }),
    { kind: 'unavailable', error, failedAt: '' },
    'lan-address-missing',
    'inspect-configuration',
  ],
  [
    'failed binding requires current observation',
    config({ networkBindings: [{ id: 'staff.binding.app', ok: false, message: 'failure' }] }),
    { kind: 'stale', snapshot: current().snapshot, error, failedAt: '' },
    'observation-stale',
    'retry-observation',
  ],
  [
    'known Docker failure beats an idle runtime cache',
    config({
      installation: { kind: 'docker-unavailable', reason: 'Docker ist nicht erreichbar.' },
    }),
    { kind: 'idle' },
    'docker-unavailable',
    'retry-observation',
  ],
  [
    'missing compose',
    config(),
    current({ compose: null }),
    'compose-unavailable',
    'retry-observation',
  ],
];
for (const [name, status, observation, code, action] of cases) {
  test(name, () => {
    const before = structuredClone({ status, observation });
    const projection = projectManagerStatus(status, observation);
    assert.equal(projection.primary.code, code);
    assert.equal(projection.primary.recommendedAction, action);
    assert.equal(projection.primary, projection.findings[0]);
    assert.equal(projection.primary.summary === 'Betrieb', code === 'runtime-healthy');
    assert.deepEqual({ status, observation }, before);
    for (const finding of projection.findings) {
      if (finding.recommendedAction === 'reinstall')
        assert.equal(status.installation?.kind, 'needs-reinstall');
    }
  });
}
test('all stale installation runtime states remain stale, not stopped or healthy', () => {
  for (const installation of [
    null,
    {
      kind: 'needs-repair',
      reasons: [{ code: 'core-stack-unhealthy', message: 'old observation' }],
    },
    { kind: 'starting' },
    { kind: 'stopped' },
    { kind: 'healthy', updateEligible: true },
  ] satisfies (InstallationState | null)[]) {
    assert.equal(
      projectManagerStatus(config({ installation }), { kind: 'unavailable', error, failedAt: '' })
        .primary.code,
      'observation-unavailable',
    );
  }
});
test('secondary findings survive; severity and stable codes decide ties regardless of evidence order', () => {
  const observation = current({
    compose: { running: true, services: [service('app', 'unhealthy'), service('sandbox')] },
    probes: [
      { id: 'app.health.lan', ok: false, message: 'AAA' },
      { id: 'app.health.local', ok: false, message: 'ZZZ' },
    ],
    proxyServer: { enabled: true, container: null },
  });
  const first = projectManagerStatus(config(), observation);
  assert.equal(first.primary.code, 'core-unhealthy');
  assert.ok(first.findings.find((item) => item.code === 'proxy-unavailable'));
  assert.ok(first.findings.find((item) => item.code === 'lan-unreachable'));
  if (observation.kind === 'current') {
    observation.snapshot.probes.reverse();
    observation.snapshot.compose!.services.reverse();
  }
  assert.deepEqual(projectManagerStatus(config(), observation), first);
  const open = projectManagerStatus(
    config({ installation: { kind: 'installing', operation } }),
    observation,
  );
  assert.equal(open.primary.code, 'installation-open');
  assert.ok(open.findings.find((item) => item.code === 'core-unhealthy'));
});

test('proxy starting is transient, while an independent DNS failure remains actionable', () => {
  const observation = current({
    proxyServer: { enabled: true, container: service('proxy', 'starting') },
  });
  assert.equal(projectManagerStatus(config(), observation).primary.code, 'runtime-starting');
  if (observation.kind === 'current')
    observation.snapshot.probes = [
      { id: 'app.health.lan', ok: false, message: 'DNS', reason: 'dns-rebind' },
    ];
  assert.equal(projectManagerStatus(config(), observation).primary.code, 'lan-unreachable');
});

test('a missing configured proxy never leaves a contradictory healthy finding', () => {
  const projection = projectManagerStatus(config(), broken);
  assert.equal(projection.primary.code, 'proxy-unavailable');
  assert.equal(
    projection.findings.some((finding) => finding.code === 'runtime-healthy'),
    false,
  );
});

test('durable update evidence outranks runtime gaps and never recommends a destructive action', () => {
  for (const updateOperation of [
    { kind: 'pending', id: 'update', phase: 'cutover' },
    { kind: 'recovery-failed', id: 'update', phase: 'recovery-failed' },
    { kind: 'unreadable' },
  ] as const) {
    const result = projectManagerStatus(
      config({ updateOperation, installation: { kind: 'fresh' } }),
      { kind: 'unavailable', error, failedAt: '' },
    );
    assert.equal(result.primary.area, 'operation');
    assert.equal(
      result.primary.recommendedAction,
      updateOperation.kind === 'pending' ? 'retry-observation' : 'inspect-configuration',
    );
    assert.equal(result.primary.severity, updateOperation.kind === 'pending' ? 'info' : 'error');
  }
});

test('restore evidence is prioritized, safe, and ordered explicitly against update findings', () => {
  for (const kind of ['pending', 'recovery-failed', 'unreadable'] as const) {
    const restoreOperation =
      kind === 'unreadable' ? { kind } : { kind, id: 'restore', phase: 'cutover' };
    const result = projectManagerStatus(
      config({ restoreOperation, installation: { kind: 'fresh' } }),
      broken,
    );
    assert.equal(
      result.primary.code,
      kind === 'pending'
        ? 'restore-pending'
        : kind === 'unreadable'
          ? 'restore-unreadable'
          : 'restore-recovery-failed',
    );
    assert.equal(
      result.primary.recommendedAction,
      kind === 'pending' ? 'retry-observation' : 'inspect-configuration',
    );
  }
  const result = projectManagerStatus(
    config({
      restoreOperation: { kind: 'unreadable' },
      updateOperation: { kind: 'unreadable' },
    }),
    broken,
  );
  assert.equal(result.primary.code, 'restore-unreadable');
  assert.deepEqual(
    result.findings.slice(0, 2).map((f) => f.code),
    ['restore-unreadable', 'update-unreadable'],
  );
  const ownedInstall = projectManagerStatus(
    config({
      restoreOperation: { kind: 'pending', id: 'restore', phase: 'cutover' },
      installation: { kind: 'installing', operation },
    }),
    broken,
  );
  assert.equal(ownedInstall.primary.code, 'restore-pending');
});

test('tlsOperation evidence is prioritized, safe, and ordered explicitly against update findings', () => {
  for (const kind of ['pending', 'recovery-failed', 'unreadable'] as const) {
    const tlsOperation =
      kind === 'unreadable' ? { kind } : { kind, id: 'tlsOperation', phase: 'cutover' };
    const result = projectManagerStatus(
      config({ tlsOperation, installation: { kind: 'fresh' } }),
      broken,
    );
    assert.equal(
      result.primary.code,
      kind === 'pending'
        ? 'tls-operation-pending'
        : kind === 'unreadable'
          ? 'tls-operation-unreadable'
          : 'tls-operation-recovery-failed',
    );
    assert.equal(
      result.primary.recommendedAction,
      kind === 'pending' ? 'retry-observation' : 'inspect-configuration',
    );
  }
  const result = projectManagerStatus(
    config({
      tlsOperation: { kind: 'unreadable' },
      updateOperation: { kind: 'unreadable' },
    }),
    broken,
  );
  assert.equal(result.primary.code, 'tls-operation-unreadable');
  assert.deepEqual(
    result.findings.slice(0, 2).map((f) => f.code),
    ['tls-operation-unreadable', 'update-unreadable'],
  );
});

test('fresh healthy runtime with a starting config still has a primary finding', () => {
  const result = projectManagerStatus(config({ installation: { kind: 'starting' } }), current());
  assert.equal(result.primary.code, 'probes-pending');
  assert.equal(result.primary.recommendedAction, 'retry-observation');
});
