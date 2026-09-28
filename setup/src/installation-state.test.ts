import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComposeStatus, DockerStatus, HostLifecycle } from '@praxis-flow/server-shared';
import { deriveInstallationState } from './installation-state.js';

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

test('docker availability has priority over all installation conclusions', () => {
  const state = deriveInstallationState({
    docker: { ...docker, daemonRunning: false },
    lifecycle,
    compose: null,
    releaseConfigured: true,
    maintenanceAuthenticated: false,
  });
  assert.equal(state.kind, 'docker-unavailable');
});

test('only a confirmed uninstalled lifecycle is fresh', () => {
  const state = deriveInstallationState({
    docker,
    lifecycle: { ...lifecycle, mode: 'uninstalled' },
    compose: null,
    releaseConfigured: false,
    maintenanceAuthenticated: false,
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
      maintenanceAuthenticated: true,
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
      maintenanceAuthenticated: true,
    }),
    { kind: 'healthy', updateEligible: true },
  );
  const unauthenticated = deriveInstallationState({
    docker,
    lifecycle,
    compose: healthyCompose,
    releaseConfigured: true,
    maintenanceAuthenticated: false,
  });
  assert.equal(unauthenticated.kind, 'needs-reinstall');
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
    maintenanceAuthenticated: true,
  });
  assert.equal(state.kind, 'healthy');
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
    maintenanceAuthenticated: true,
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
      maintenanceAuthenticated: true,
    });
    assert.deepEqual(state, {
      kind: 'needs-reinstall',
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
    maintenanceAuthenticated: false,
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
    maintenanceAuthenticated: false,
  });
  assert.deepEqual(state, {
    kind: 'needs-reinstall',
    reasons: [{ code: 'broken', message: 'Widerspruch' }],
  });
});
