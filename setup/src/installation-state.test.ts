import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComposeStatus, DockerStatus, HostLifecycle } from '@wartezimmer/server-shared';
import { deriveInstallationState, type InstallationStateFacts } from './installation-state.js';

const docker: DockerStatus = {
  installed: true,
  daemonRunning: true,
  composeAvailable: true,
  detail: 'test',
};
const lifecycle: HostLifecycle = {
  assessment: 'known',
  mode: 'direct-http',
  preparation: 'none',
  operation: 'none',
  issues: [],
  recovery: 'none',
};
const healthyCompose: ComposeStatus = {
  running: true,
  services: [
    { name: 'project-app-1', service: 'app', state: 'running', health: 'healthy' },
    { name: 'project-sandbox-1', service: 'sandbox', state: 'running', health: 'healthy' },
  ],
};

test('Docker unavailability remains explicit when no durable finding takes priority', () => {
  const state = deriveInstallationState({
    docker: { ...docker, daemonRunning: false },
    lifecycle,
    compose: null,
    releaseConfigured: true,
    maintenanceStatus: 'unauthorized',
  });
  assert.equal(state?.kind, 'docker-unavailable');
});

test('only a confirmed uninstalled lifecycle is fresh', () => {
  const state = deriveInstallationState({
    docker,
    lifecycle: { ...lifecycle, mode: 'uninstalled' },
    compose: null,
    releaseConfigured: false,
    maintenanceStatus: 'unauthorized',
  });
  assert.deepEqual(state, { kind: 'fresh' });
});

test('an active prepared operation is exposed as installing without inventing another state name', () => {
  const operation = {
    id: 'op-1',
    mode: 'replace' as const,
    phase: 'prepared' as const,
    createdAt: '2026-09-18T10:00:00.000Z',
    releaseVersion: '1.2.3',
    backupContainsTls: null,
  };
  assert.deepEqual(
    deriveInstallationState({
      docker,
      lifecycle,
      compose: healthyCompose,
      releaseConfigured: true,
      maintenanceStatus: 'compatible',
      operation,
    }),
    { kind: 'installing', operation },
  );
});

test('healthy requires core services, release state and maintenance authentication', () => {
  assert.deepEqual(
    deriveInstallationState({
      docker,
      lifecycle,
      compose: healthyCompose,
      releaseConfigured: true,
      maintenanceStatus: 'compatible',
    }),
    { kind: 'healthy', updateEligible: true },
  );
  const unauthenticated = deriveInstallationState({
    docker,
    lifecycle,
    compose: healthyCompose,
    releaseConfigured: true,
    maintenanceStatus: 'unauthorized',
  });
  assert.equal(unauthenticated?.kind, 'needs-repair');
});

test('optional proxy health does not affect the healthy installation gate', () => {
  const state = deriveInstallationState({
    docker,
    lifecycle: { ...lifecycle, mode: 'proxy-http' },
    compose: {
      ...healthyCompose,
      services: [
        ...healthyCompose.services,
        { name: 'project-proxy-1', service: 'proxy', state: 'exited', health: 'unhealthy' },
      ],
    },
    releaseConfigured: true,
    maintenanceStatus: 'compatible',
  });
  assert.equal(state?.kind, 'healthy');
});

test('a starting core healthcheck is a transient state, not a reinstall requirement', () => {
  const state = deriveInstallationState({
    docker,
    lifecycle,
    compose: {
      running: false,
      services: [
        healthyCompose.services[0]!,
        {
          name: 'project-sandbox-1',
          service: 'sandbox',
          state: 'running',
          health: 'starting',
        },
      ],
    },
    releaseConfigured: true,
    maintenanceStatus: 'compatible',
  });
  assert.deepEqual(state, { kind: 'starting' });
});

test('an unhealthy core service or restart loop still requires repair', () => {
  for (const stateName of ['running', 'restarting']) {
    const state = deriveInstallationState({
      docker,
      lifecycle,
      compose: {
        running: false,
        services: [
          healthyCompose.services[0]!,
          {
            name: 'project-sandbox-1',
            service: 'sandbox',
            state: stateName,
            health: 'unhealthy',
          },
        ],
      },
      releaseConfigured: true,
      maintenanceStatus: 'compatible',
    });
    assert.deepEqual(state, {
      kind: 'needs-repair',
      reasons: [
        {
          code: 'core-stack-unhealthy',
          message: 'App und Sandbox sind nicht gemeinsam gesund gestartet.',
        },
      ],
    });
  }
});

test('a configured installation with no running core services is stopped', () => {
  const state = deriveInstallationState({
    docker,
    lifecycle,
    compose: { running: false, services: [] },
    releaseConfigured: true,
    maintenanceStatus: 'unauthorized',
  });
  assert.deepEqual(state, { kind: 'stopped' });
});

test('inconsistent lifecycle is never presented as stopped or healthy', () => {
  const state = deriveInstallationState({
    docker,
    lifecycle: {
      ...lifecycle,
      assessment: 'inconsistent',
      mode: null,
      issues: [{ code: 'broken', message: 'Widerspruch' }],
    },
    compose: null,
    releaseConfigured: true,
    maintenanceStatus: 'unauthorized',
  });
  assert.deepEqual(state, {
    kind: 'inconsistent',
    reasons: [{ code: 'broken', message: 'Widerspruch' }],
  });
});

test('diagnosis distinguishes runtime failure, inconsistent evidence and proven missing substance', () => {
  const cases: Array<[Partial<InstallationStateFacts>, string, string]> = [
    [{ maintenanceStatus: 'unauthorized' }, 'needs-repair', 'maintenance-auth-failed'],
    [{ maintenanceStatus: 'incompatible' }, 'needs-repair', 'maintenance-incompatible'],
    [{ maintenanceStatus: 'unreachable' }, 'needs-repair', 'maintenance-unreachable'],
    [{ maintenanceStatus: 'invalid-response' }, 'needs-repair', 'maintenance-invalid-response'],
    [{ maintenanceStatus: 'http-error' }, 'needs-repair', 'maintenance-http-error'],
    [
      { compose: { running: true, services: [healthyCompose.services[0]!] } },
      'needs-repair',
      'core-stack-unhealthy',
    ],
    [{ releaseConfigured: false }, 'inconsistent', 'release-state-missing'],
    [
      {
        operationUnreadable: true,
        docker: { ...docker, daemonRunning: false },
      },
      'inconsistent',
      'install-operation-invalid',
    ],
    [
      { lifecycle: { ...lifecycle, assessment: 'unknown', mode: null } },
      'inconsistent',
      'installation-state-unknown',
    ],
    ...(['app-image-missing', 'data-volume-missing', 'database-missing'] as const).map(
      (code) =>
        [{ startFailure: code }, 'needs-reinstall', code] as [
          Partial<InstallationStateFacts>,
          string,
          string,
        ],
    ),
    ...(
      [
        'compose-start-failed',
        'health-timeout',
        'maintenance-auth-failed',
        'maintenance-incompatible',
      ] as const
    ).map(
      (code) =>
        [{ startFailure: code }, 'needs-repair', code] as [
          Partial<InstallationStateFacts>,
          string,
          string,
        ],
    ),
  ];
  for (const [overrides, kind, code] of cases) {
    const result = deriveInstallationState({
      docker,
      lifecycle,
      compose: healthyCompose,
      releaseConfigured: true,
      maintenanceStatus: 'compatible',
      ...overrides,
    });
    assert.ok(result);
    assert.equal(result.kind, kind, code);
    assert.ok('reasons' in result);
    assert.equal(result.reasons[0]?.code, code);
  }
});

test('missing Compose evidence preserves durable findings without inventing runtime states', () => {
  const facts: InstallationStateFacts = {
    docker,
    lifecycle,
    compose: null,
    releaseConfigured: true,
    maintenanceStatus: 'unauthorized',
  };
  assert.equal(deriveInstallationState(facts), null);
  assert.equal(
    deriveInstallationState({ ...facts, operationUnreadable: true })?.kind,
    'inconsistent',
  );
  assert.equal(
    deriveInstallationState({ ...facts, releaseConfigured: false })?.kind,
    'inconsistent',
  );
  assert.equal(
    deriveInstallationState({ ...facts, startFailure: 'database-missing' })?.kind,
    'needs-reinstall',
  );
  assert.equal(
    deriveInstallationState({
      ...facts,
      operation: {
        id: 'op',
        mode: 'fresh',
        phase: 'prepared',
        createdAt: '',
        releaseVersion: '1',
        backupContainsTls: null,
      },
      docker: { ...docker, daemonRunning: false },
    })?.kind,
    'installing',
  );
});

test('offline first launch opens prerequisites without claiming fresh or missing release corruption', () => {
  const facts: InstallationStateFacts = {
    docker: { ...docker, daemonRunning: false },
    lifecycle: {
      ...lifecycle,
      assessment: 'unknown',
      mode: null,
      issues: [{ code: 'installation-unchecked', message: 'Docker probe unavailable' }],
    },
    compose: null,
    releaseConfigured: false,
    maintenanceStatus: 'unauthorized',
  };
  assert.equal(deriveInstallationState(facts)?.kind, 'docker-unavailable');
  assert.equal(deriveInstallationState({ ...facts, docker })?.kind, 'inconsistent');
  assert.equal(
    deriveInstallationState({ ...facts, operationUnreadable: true })?.kind,
    'inconsistent',
  );
  assert.equal(
    deriveInstallationState({
      ...facts,
      lifecycle: {
        ...facts.lifecycle,
        assessment: 'inconsistent',
        issues: [{ code: 'installation-remnants', message: 'TLS files' }],
      },
    })?.kind,
    'inconsistent',
  );
});
