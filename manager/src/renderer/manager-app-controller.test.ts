import { projectManagerStatus } from '@praxis-flow/server-shared/manager-status-projection';
import {
  failedRuntimeObservation,
  runtimeSnapshot,
  type RuntimeObservation,
} from './runtime-observation.js';
import assert from 'node:assert/strict';
import { createWizardController } from './wizard-controller.js';
import test from 'node:test';
import type { HostRuntimeHealth } from '@praxis-flow/server-shared/setup-api';
import type { HostStatus } from '../shared/host-status.js';
import {
  freshInstallHostStatus,
  minimalHostStatus,
  knownLifecycle,
} from './test-fixtures/minimal-host-status.js';
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
  runtimeObservation: RuntimeObservation;
  statusError: string | null;
  events: string[];
  wizardSessions: Array<{ status: HostStatus | null; presentation: WizardPresentation }>;
} {
  const state = {
    activeView: 'status' as ManagerView,
    wizardPresentation: 'embedded' as WizardPresentation,
    bootReady: false,
    configSnapshot: null as HostStatus | null,
    runtimeObservation: { kind: 'idle' } as RuntimeObservation,
    statusError: null as string | null,
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
      this.runtimeObservation = { kind: 'current', snapshot: runtime };
    },
    applyRuntimeError(error) {
      this.runtimeObservation = failedRuntimeObservation(this.runtimeObservation, error);
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
  assert.equal(runtimeSnapshot(shell.runtimeObservation), null);
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
  assert.ok(runtimeSnapshot(shell.runtimeObservation));
  assert.ok(shell.events.indexOf('nav:status:') < shell.events.indexOf('bootReady'));
});

test('runtime failure exposes a controlled stale-data warning instead of technical details', async () => {
  const { controller, shell } = createTestController({
    fetchSetupStatus: async () => minimalHostStatus(),
    fetchRuntimeHealth: async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:49152');
    },
  });

  await controller.start();

  assert.equal(shell.runtimeObservation.kind, 'unavailable');
  assert.ok('error' in shell.runtimeObservation);
  assert.equal(
    shell.runtimeObservation.error.message,
    'Laufzustand konnte nicht aktualisiert werden. Die angezeigten Betriebsdaten können veraltet sein.',
  );
  assert.doesNotMatch(shell.runtimeObservation.error.message, /ECONNREFUSED|127\.0\.0\.1/);
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
  assert.equal(runtimeSnapshot(shell.runtimeObservation), null);
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
  assert.ok(runtimeSnapshot(shell.runtimeObservation));
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

test('concurrent mutation notifications serialize config and runtime reconciliation', async () => {
  let version = 0;
  const callLog: CallLog = [];
  const { controller, shell } = createTestController({
    fetchSetupStatus: async () => minimalHostStatus({ practiceDisplayName: `Version ${version}` }),
    callLog,
  });

  await controller.start();
  version = 1;
  await Promise.all([controller.onAfterMutation(), controller.onAfterMutation()]);

  assert.equal(shell.configSnapshot?.practiceDisplayName, 'Version 1');
  assert.deepEqual(callLog, ['config', 'runtime', 'config', 'runtime', 'config', 'runtime']);
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

test('confirmed missing substance keeps explicit recovery entry fullscreen', async () => {
  const status = freshInstallHostStatus();
  status.installation = { kind: 'needs-reinstall', reasons: [] };
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
  assert.equal(shell.configSnapshot?.installation?.kind, 'healthy');
  assert.equal(chromeVisible(shell), true);
});

test('runtime failure keeps config and last snapshot stale; a later success recovers', async () => {
  const status = minimalHostStatus();
  const first = minimalRuntime();
  const second = minimalRuntime({ checkedAt: 'later-success' });
  let attempt = 0;
  const { controller, shell } = createTestController({
    fetchSetupStatus: async () => status,
    fetchRuntimeHealth: async () => {
      attempt += 1;
      if (attempt === 2 || attempt === 3) throw new Error('private detail');
      return attempt === 1 ? first : second;
    },
  });
  assert.equal(String(shell.runtimeObservation.kind), 'idle');
  await controller.start();
  assert.equal(String(shell.runtimeObservation.kind), 'current');
  for (let i = 0; i < 2; i += 1) {
    await controller.onAfterMutation();
    assert.equal(shell.runtimeObservation.kind, 'stale');
    assert.equal(runtimeSnapshot(shell.runtimeObservation), first);
    assert.equal(shell.configSnapshot, status);
    assert.ok('failedAt' in shell.runtimeObservation);
    assert.ok(Number.isFinite(Date.parse(shell.runtimeObservation.failedAt)));
  }
  await controller.onAfterMutation();
  assert.deepEqual(shell.runtimeObservation, { kind: 'current', snapshot: second });
});

test('diagnosis states do not enter the wizard through tabs or setup callbacks', async () => {
  for (const kind of ['needs-repair', 'inconsistent'] as const) {
    const status = minimalHostStatus({ installation: { kind, reasons: [] } });
    const { controller, shell } = createTestController({ fetchSetupStatus: async () => status });
    await controller.start();
    controller.navigateTab('wizard');
    controller.onStatusSetupClick();
    controller.onStatusLoadReleaseArchive();
    assert.equal(shell.activeView, 'status');
    assert.equal(shell.wizardSessions.length, 0);
  }
});

test('cold start retains configured HTTP and HTTPS through unavailable, stale and recovery', async () => {
  for (const mode of ['proxy-http', 'https'] as const) {
    let fail = true;
    let revision = 0;
    const config = () =>
      minimalHostStatus({
        lifecycle: knownLifecycle(mode),
        installation: fail ? null : { kind: 'stopped' },
        compose: fail ? null : { running: false, services: [] },
        practiceDisplayName: `Config ${revision}`,
      });
    const snapshot = minimalRuntime({ compose: { running: false, services: [] } });
    const { controller, shell, hostRefresh } = createTestController({
      fetchSetupStatus: async () => config(),
      fetchRuntimeHealth: async () => {
        if (fail) throw new Error('Compose failed');
        return snapshot;
      },
    });
    await controller.start();
    assert.equal(shell.bootReady, true);
    assert.equal(shell.activeView, 'status');
    assert.equal(shell.configSnapshot?.lifecycle?.mode, mode);
    assert.equal(shell.runtimeObservation.kind, 'unavailable');
    const projection = projectManagerStatus(shell.configSnapshot, shell.runtimeObservation);
    assert.equal(projection.primary.summary, 'Laufzustand nicht prüfbar');
    assert.deepEqual(
      projection.findings.map((finding) => finding.code),
      ['observation-unavailable'],
    );
    assert.equal(shell.statusError, null);
    controller.onStatusSetupClick();
    assert.equal(shell.activeView, 'status');
    assert.equal(shell.wizardSessions.length, 0);

    fail = false;
    await hostRefresh.refresh({ scope: 'runtime', silent: true });
    assert.equal(String(shell.runtimeObservation.kind), 'current');
    assert.equal(
      projectManagerStatus(shell.configSnapshot, shell.runtimeObservation).primary.code,
      'runtime-stopped',
    );

    fail = true;
    revision += 1;
    await hostRefresh.refresh({ scope: 'full' });
    assert.equal(String(shell.runtimeObservation.kind), 'stale');
    assert.equal(runtimeSnapshot(shell.runtimeObservation), snapshot);
    assert.equal(shell.configSnapshot?.practiceDisplayName, 'Config 1');
    assert.equal(
      projectManagerStatus(shell.configSnapshot, shell.runtimeObservation).primary.code,
      'observation-stale',
    );

    fail = false;
    await hostRefresh.refresh({ scope: 'runtime', silent: true });
    assert.equal(String(shell.runtimeObservation.kind), 'current');
  }
});
