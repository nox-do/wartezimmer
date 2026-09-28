import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostRefreshController } from './host-refresh-controller.js';
import {
  createManagerNavigation,
  defaultWizardPresentation,
  shouldAutoStartFullscreenWizard,
} from './manager-navigation.js';
import type { ManagerNavigationSessions } from './manager-navigation.js';
import type { HostStatus } from '../shared/host-status.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import type { WizardPresentation } from './manager-navigation.js';

function createMockHostRefresh(options: {
  getView: () => 'status' | 'maintenance' | 'network' | 'wizard';
  refresh?: () => Promise<HostStatus | null>;
  getLastConfig?: () => HostStatus | null;
}): HostRefreshController {
  return {
    getView: options.getView,
    setView: () => {},
    refresh: options.refresh ?? (async () => null),
    getLastConfig: options.getLastConfig ?? (() => minimalHostStatus()),
    getLastRuntime: () => null,
  };
}

function createSessionRecorder(): ManagerNavigationSessions & {
  loading: boolean[];
  maintenanceBegun: number;
  networkBegun: number;
  wizardShown: Array<{ status: HostStatus | null; presentation: WizardPresentation }>;
  cleared: Array<'status' | 'maintenance' | 'network' | 'wizard'>;
} {
  const loading: boolean[] = [];
  let maintenanceBegun = 0;
  let networkBegun = 0;
  const wizardShown: Array<{ status: HostStatus | null; presentation: WizardPresentation }> = [];
  const cleared: Array<'status' | 'maintenance' | 'network' | 'wizard'> = [];

  return {
    loading,
    get maintenanceBegun() {
      return maintenanceBegun;
    },
    get networkBegun() {
      return networkBegun;
    },
    wizardShown,
    cleared,
    clearInactive: (active) => {
      cleared.push(active);
    },
    setDeferredLoading: (_view, value) => {
      loading.push(value);
    },
    beginMaintenance: () => {
      maintenanceBegun += 1;
    },
    beginNetwork: () => {
      networkBegun += 1;
    },
    beginWizard: (status, presentation) => {
      wizardShown.push({ status, presentation });
    },
  };
}

test('deferred view shows loading until refresh completes', async () => {
  let resolveRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    resolveRefresh = resolve;
  });

  const sessions = createSessionRecorder();

  const navigation = createManagerNavigation({
    hostRefresh: createMockHostRefresh({
      getView: () => 'maintenance',
      refresh: async () => {
        await refreshGate;
        return null;
      },
    }),
    syncShell: () => {},
    sessions,
    fetchSetupStatus: async () => minimalHostStatus(),
  });

  navigation.navigateTo('maintenance');
  assert.deepEqual(sessions.loading, [true]);
  resolveRefresh();
  await refreshGate;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(sessions.loading, [true, false]);
  assert.equal(sessions.maintenanceBegun, 1);
});

test('does not begin maintenance after navigating to network before refresh resolves', async () => {
  let currentView: 'status' | 'maintenance' | 'network' | 'wizard' = 'status';
  let resolveRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    resolveRefresh = resolve;
  });

  const sessions = createSessionRecorder();

  const navigation = createManagerNavigation({
    hostRefresh: {
      getView: () => currentView,
      setView: (view) => {
        currentView = view;
      },
      refresh: async () => {
        await refreshGate;
        return null;
      },
      getLastConfig: () => minimalHostStatus({ practiceDisplayName: 'Fresh' }),
      getLastRuntime: () => null,
    },
    syncShell: () => {},
    sessions,
    fetchSetupStatus: async () => minimalHostStatus(),
  });

  navigation.navigateTo('maintenance');
  navigation.navigateTo('network');
  resolveRefresh();
  await refreshGate;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(sessions.maintenanceBegun, 0);
  assert.equal(sessions.networkBegun, 1);
  assert.deepEqual(sessions.cleared, ['maintenance', 'network']);
});

test('wizard reuses provided status without a second fetch', () => {
  const sessions = createSessionRecorder();
  let fetched = 0;
  const status = minimalHostStatus({ envExists: false });

  const navigation = createManagerNavigation({
    hostRefresh: createMockHostRefresh({
      getView: () => 'wizard',
    }),
    syncShell: () => {},
    sessions,
    fetchSetupStatus: async () => {
      fetched += 1;
      return minimalHostStatus();
    },
  });

  navigation.navigateTo('wizard', { wizardPresentation: 'fullscreen', status });

  assert.equal(fetched, 0);
  assert.equal(sessions.wizardShown.length, 1);
  assert.equal(sessions.wizardShown[0]?.status, status);
  assert.equal(sessions.wizardShown[0]?.presentation, 'fullscreen');
});

test('status boot navigation skips refresh when refresh is false', () => {
  let refreshCalls = 0;
  const sessions = createSessionRecorder();
  const synced: Array<{ view: string; refresh?: boolean }> = [];

  const navigation = createManagerNavigation({
    hostRefresh: createMockHostRefresh({
      getView: () => 'status',
      refresh: async () => {
        refreshCalls += 1;
        return null;
      },
    }),
    syncShell: (view, options) => {
      synced.push({ view, refresh: options?.refresh });
    },
    sessions,
    fetchSetupStatus: async () => minimalHostStatus(),
  });

  navigation.navigateTo('status', { refresh: false });

  assert.equal(refreshCalls, 0);
  assert.equal(sessions.loading.length, 0);
  assert.deepEqual(synced, [{ view: 'status', refresh: false }]);
});

test('status tab still runs a full refresh by default', async () => {
  let refreshCalls = 0;
  const sessions = createSessionRecorder();

  const navigation = createManagerNavigation({
    hostRefresh: createMockHostRefresh({
      getView: () => 'status',
      refresh: async () => {
        refreshCalls += 1;
        return null;
      },
    }),
    syncShell: () => {},
    sessions,
    fetchSetupStatus: async () => minimalHostStatus(),
  });

  navigation.navigateTo('status');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(refreshCalls, 1);
});

test('does not show wizard after leaving wizard before fetch resolves', async () => {
  let currentView: 'status' | 'maintenance' | 'network' | 'wizard' = 'status';
  let resolveFetch!: (value: HostStatus) => void;
  const fetchGate = new Promise<HostStatus>((resolve) => {
    resolveFetch = resolve;
  });

  const sessions = createSessionRecorder();

  const navigation = createManagerNavigation({
    hostRefresh: createMockHostRefresh({
      getView: () => currentView,
    }),
    syncShell: () => {},
    sessions,
    fetchSetupStatus: () => fetchGate,
  });

  navigation.navigateTo('wizard');
  currentView = 'status';
  resolveFetch(minimalHostStatus());
  await fetchGate;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(sessions.wizardShown.length, 0);
});

test('installation state controls wizard presentation and auto-start', () => {
  assert.equal(shouldAutoStartFullscreenWizard(null), false);
  for (const kind of [
    'fresh',
    'healthy',
    'starting',
    'stopped',
    'needs-reinstall',
    'docker-unavailable',
    'installing',
  ] as const) {
    const installation =
      kind === 'installing'
        ? {
            kind,
            operation: {
              id: 'test',
              mode: 'replace' as const,
              phase: 'prepared' as const,
              createdAt: '',
              releaseVersion: '1',
              backupContainsTls: null,
            },
          }
        : kind === 'needs-reinstall'
          ? { kind, reasons: [] }
          : kind === 'docker-unavailable'
            ? { kind, reason: 'offline' }
            : kind === 'healthy'
              ? { kind, updateEligible: true as const }
              : { kind };
    const status = minimalHostStatus({ installation });
    assert.equal(
      shouldAutoStartFullscreenWizard(status),
      kind === 'fresh' || kind === 'installing',
    );
    assert.equal(
      defaultWizardPresentation(status),
      kind === 'healthy' || kind === 'starting' ? 'embedded' : 'fullscreen',
    );
  }
});
