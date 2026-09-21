import assert from 'node:assert/strict';
import { createWizardController } from './wizard-controller.js';
import test from 'node:test';
import type { HostRuntimeHealth } from '@praxis-flow/server-shared/setup-api';
import type { HostStatus } from '../shared/host-status.js';
import { freshInstallHostStatus, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createHostRefreshController } from './host-refresh-controller.js';
import type { HostRefreshController } from './host-refresh-controller.js';
import type { ManagerView } from './host-refresh-controller.js';
import type { NavigateOptions, WizardPresentation } from './manager-navigation.js';
import { createManagerAppController, type ManagerAppShell } from './manager-app-controller.js';

function minimalRuntime(overrides: Partial<HostRuntimeHealth> = {}): HostRuntimeHealth {
  const status = minimalHostStatus();
  return {
    checkedAt: '2026-06-30T12:00:00.000Z',
    envExists: status.envExists,
    configuredLanIp: status.network.configuredLanIp,
    appBaseUrl: status.appBaseUrl,
    docker: status.docker,
    compose: status.compose,
    probes: [{ id: 'app.health.local', ok: true, message: 'ok' }],
    sandboxScanner: null,
    proxyServer: null,
    ...overrides,
  };
}

type CallLog = string[];

function createFakeShell(): ManagerAppShell & {
  activeView: ManagerView;
  wizardPresentation: WizardPresentation;
  bootReady: boolean;
  configSnapshot: HostStatus | null;
  runtimeSnapshot: HostRuntimeHealth | null;
  statusError: string | null;
  runtimeError: string | null;
  events: string[];
  wizardSessions: Array<{ status: HostStatus | null; presentation: WizardPresentation }>;
} {
  const state = {
    activeView: 'status' as ManagerView,
    wizardPresentation: 'embedded' as WizardPresentation,
    bootReady: false,
    configSnapshot: null as HostStatus | null,
    runtimeSnapshot: null as HostRuntimeHealth | null,
    statusError: null as string | null,
    runtimeError: null as string | null,
    events: [] as string[],
    wizardSessions: [] as Array<{
      status: HostStatus | null;
      presentation: WizardPresentation;
    }>,
  };

  return {
    ...state,
    applyConfigSnapshot(status) {
      state.configSnapshot = status;
      state.statusError = null;
      this.configSnapshot = status;
      this.statusError = null;
    },
    applyRuntimeSnapshot(runtime) {
      state.runtimeSnapshot = runtime;
      state.runtimeError = null;
      this.runtimeSnapshot = runtime;
      this.runtimeError = null;
    },
    applyRuntimeError(message) {
      state.runtimeError = message;
      this.runtimeError = message;
    },
    applyStatusError(message) {
      state.statusError = message;
      this.statusError = message;
    },
    markBootReady() {
      state.bootReady = true;
      this.bootReady = true;
      state.events.push('bootReady');
      this.events = state.events;
    },
    applyShellNavigation(view: ManagerView, options: NavigateOptions = {}) {
      state.activeView = view;
      this.activeView = view;
      if (options.wizardPresentation) {
        state.wizardPresentation = options.wizardPresentation;
        this.wizardPresentation = options.wizardPresentation;
      }
      state.events.push(`nav:${view}:${options.wizardPresentation ?? ''}`);
      this.events = state.events;
    },
    beginMaintenanceSession() {},
    beginNetworkSession() {},
    beginWizardSession(status, presentation) {
      state.wizardSessions.push({ status, presentation });
      this.wizardSessions = state.wizardSessions;
    },
    clearInactiveViewSessions() {},
    setDeferredViewLoading() {},
  };
}

function createTestController(options: {
  fetchSetupStatus: () => Promise<HostStatus>;
  fetchRuntimeHealth?: () => Promise<HostRuntimeHealth>;
  callLog?: CallLog;
  timers?: Array<{ delay: number; cb: () => void }>;
}): {
  controller: ReturnType<typeof createManagerAppController>;
  shell: ReturnType<typeof createFakeShell>;
  hostRefresh: HostRefreshController;
  timers: Array<{ delay: number; cb: () => void }>;
} {
  const shell = createFakeShell();
  const timers = options.timers ?? [];
  const callLog = options.callLog ?? [];
  let hostRefresh!: HostRefreshController;

  const controller = createManagerAppController({
    api: () =>
      ({
        fetchSetupStatus: async () => {
          callLog.push('config');
          return options.fetchSetupStatus();
        },
        fetchRuntimeHealth: async () => {
          callLog.push('runtime');
          return options.fetchRuntimeHealth ? options.fetchRuntimeHealth() : minimalRuntime();
        },
        openExternalUrl: async () => {},
      }) as never,
    shell,
    createHostRefresh: (deps) => {
      hostRefresh = createHostRefreshController({
        ...deps,
        pollIntervalMs: 5_000,
        schedule: (cb, delay) => {
          timers.push({ delay, cb });
          return timers.length;
        },
        clearSchedule: () => {
          timers.length = 0;
        },
      });
      return hostRefresh;
    },
  });

  return { controller, shell, hostRefresh, timers };
}

function chromeVisible(shell: ReturnType<typeof createFakeShell>): boolean {
  return (
    shell.bootReady && !(shell.activeView === 'wizard' && shell.wizardPresentation === 'fullscreen')
  );
}

test('boot without .env opens wizard fullscreen without runtime or poll', async () => {
  const setup = freshInstallHostStatus();
  const callLog: CallLog = [];
  const { controller, shell, timers } = createTestController({
    fetchSetupStatus: async () => setup,
    callLog,
  });

  await controller.start();

  assert.equal(shell.activeView, 'wizard');
  assert.equal(shell.wizardPresentation, 'fullscreen');
  assert.equal(shell.bootReady, true);
  assert.equal(chromeVisible(shell), false);
  assert.deepEqual(callLog, ['config']);
  assert.equal(timers.length, 0);
  assert.equal(shell.runtimeSnapshot, null);
  assert.equal(shell.wizardSessions[0]?.status, setup);
  assert.ok(shell.events.indexOf('nav:wizard:fullscreen') < shell.events.indexOf('bootReady'));
});

test('boot with .env opens status then fetches runtime and starts poll', async () => {
  const callLog: CallLog = [];
  const { controller, shell, timers } = createTestController({
    fetchSetupStatus: async () => minimalHostStatus(),
    callLog,
  });

  await controller.start();

  assert.equal(shell.activeView, 'status');
  assert.equal(shell.bootReady, true);
  assert.equal(chromeVisible(shell), true);
  assert.deepEqual(callLog, ['config', 'runtime']);
  assert.equal(timers.length, 1);
  assert.ok(shell.runtimeSnapshot);
  assert.ok(shell.events.indexOf('nav:status:') < shell.events.indexOf('bootReady'));
});

test('boot config error shows status error without wizard or poll', async () => {
  const callLog: CallLog = [];
  const { controller, shell, timers } = createTestController({
    fetchSetupStatus: async () => {
      throw new Error('Setup-API nicht erreichbar — bitte Manager neu starten.');
    },
    callLog,
  });

  await controller.start();

  assert.equal(shell.activeView, 'status');
  assert.equal(shell.bootReady, true);
  assert.equal(chromeVisible(shell), true);
  assert.equal(shell.statusError, 'Setup-API nicht erreichbar — bitte Manager neu starten.');
  assert.equal(shell.wizardSessions.length, 0);
  assert.deepEqual(callLog, ['config']);
  assert.equal(timers.length, 0);
  assert.equal(shell.runtimeSnapshot, null);
});

test('cancel fullscreen without .env lands on status with chrome and does not re-hijack', async () => {
  const setup = freshInstallHostStatus();
  const callLog: CallLog = [];
  const { controller, shell, timers, hostRefresh } = createTestController({
    fetchSetupStatus: async () => setup,
    callLog,
  });

  await controller.start();
  controller.onWizardCancel();

  assert.equal(shell.activeView, 'status');
  assert.equal(shell.bootReady, true);
  assert.equal(chromeVisible(shell), true);
  assert.equal(timers.length, 0);
  assert.deepEqual(callLog, ['config']);

  const eventsAfterCancel = shell.events.length;
  await hostRefresh.refresh({ scope: 'config' });
  assert.equal(shell.activeView, 'status');
  assert.equal(shell.events.filter((event) => event.startsWith('nav:wizard')).length, 1);
  assert.equal(shell.events.length, eventsAfterCancel);
  assert.equal(timers.length, 0);
});

test('apply is one config-only then runtime as soon as .env exists, still on wizard', async () => {
  let envExists = false;
  const callLog: CallLog = [];
  const { controller, shell, timers } = createTestController({
    fetchSetupStatus: async () => (envExists ? minimalHostStatus() : freshInstallHostStatus()),
    callLog,
  });

  await controller.start();
  assert.equal(shell.activeView, 'wizard');
  assert.deepEqual(callLog, ['config']);

  envExists = true;
  await controller.onAfterMutation();

  assert.equal(shell.activeView, 'wizard');
  assert.equal(shell.wizardPresentation, 'fullscreen');
  assert.deepEqual(callLog, ['config', 'config', 'runtime']);
  assert.equal(shell.configSnapshot?.envExists, true);
  assert.ok(shell.runtimeSnapshot);
  assert.equal(timers.length, 1);
});

test('tools mutation with .env fetches config then runtime immediately', async () => {
  const callLog: CallLog = [];
  const { controller } = createTestController({
    fetchSetupStatus: async () => minimalHostStatus(),
    callLog,
  });

  await controller.start();
  await controller.onAfterMutation();
  assert.deepEqual(callLog, ['config', 'runtime', 'config', 'runtime']);
});

test('later config without .env stops poll without changing the route', async () => {
  let envExists = true;
  const { controller, shell, timers, hostRefresh } = createTestController({
    fetchSetupStatus: async () => (envExists ? minimalHostStatus() : freshInstallHostStatus()),
  });

  await controller.start();
  assert.equal(shell.activeView, 'status');
  assert.equal(timers.length, 1);

  envExists = false;
  await hostRefresh.refresh({ scope: 'config' });

  assert.equal(shell.activeView, 'status');
  assert.equal(shell.bootReady, true);
  assert.equal(shell.configSnapshot?.envExists, false);
  assert.equal(timers.length, 0);
});

test('later config error keeps last ops snapshot and poll', async () => {
  let failConfig = false;
  const { controller, shell, timers, hostRefresh } = createTestController({
    fetchSetupStatus: async () => {
      if (failConfig) {
        throw new Error('config later down');
      }
      return minimalHostStatus({ practiceDisplayName: 'Ops' });
    },
  });

  await controller.start();
  assert.equal(timers.length, 1);
  failConfig = true;
  await hostRefresh.refresh({ scope: 'config' });

  assert.equal(shell.activeView, 'status');
  assert.equal(shell.bootReady, true);
  assert.equal(shell.configSnapshot?.practiceDisplayName, 'Ops');
  assert.equal(shell.statusError, 'config later down');
  assert.equal(timers.length, 1);
});

test('boot with configured HTTPS and stopped Docker keeps status and starts runtime polling', async () => {
  const status = minimalHostStatus({
    docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: null },
  });
  status.lifecycle = {
    assessment: 'known',
    mode: 'https',
    preparation: 'none',
    operation: 'none',
    recovery: 'none',
    issues: [],
  };
  const { controller, shell, timers } = createTestController({
    fetchSetupStatus: async () => status,
  });
  await controller.start();
  assert.equal(shell.activeView, 'status');
  assert.equal(shell.wizardSessions.length, 0);
  assert.ok(timers.length > 0);
});

test('boot with remnants keeps diagnosis visible and explicit recovery entry fullscreen', async () => {
  const status = freshInstallHostStatus();
  status.installation = { kind: 'needs-reinstall', reasons: [] };
  status.lifecycle = {
    assessment: 'inconsistent',
    mode: null,
    preparation: 'none',
    operation: 'none',
    recovery: 'none',
    issues: [],
  };
  const { controller, shell } = createTestController({ fetchSetupStatus: async () => status });
  await controller.start();
  assert.equal(shell.activeView, 'status');
  assert.equal(shell.wizardSessions.length, 0);
  controller.onStatusSetupClick();
  assert.equal(shell.activeView, 'wizard');
  assert.equal(shell.wizardPresentation, 'fullscreen');
});

test('recovery completion reaches healthy status without a stale installation card', async () => {
  const operation = {
    id: 'finish-test',
    mode: 'fresh' as const,
    phase: 'installing' as const,
    createdAt: '2026-09-21',
    releaseVersion: '0.6.0',
    backupContainsTls: null,
  };
  let status = minimalHostStatus({ installation: { kind: 'installing', operation } });
  const { controller, shell } = createTestController({ fetchSetupStatus: async () => status });
  await controller.start();
  const wizard = createWizardController({
    api: {
      fetchSetupStatus: async () => status,
      previewInstallRecovery: async () => ({
        operation,
        baselineReady: true,
        baselineErrors: [],
        backup: null,
        restoreCompatible: false,
      }),
      finishInstallRecovery: async () => {
        status = minimalHostStatus();
        return { ok: true, errors: [] };
      },
    } as never,
    onHostMutated: controller.onAfterMutation,
    onComplete: controller.onWizardComplete,
    onCancel: controller.onWizardCancel,
  });
  wizard.show(status);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await wizard.finishRecovery('without-backup');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(shell.activeView, 'status');
  assert.equal(shell.configSnapshot?.installation.kind, 'healthy');
  assert.equal(chromeVisible(shell), true);
});
