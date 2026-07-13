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
  refresh?: () => Promise<void>;
}): HostRefreshController {
  return {
    getView: options.getView,
    setView: () => {},
    refresh: options.refresh ?? (async () => {}),
    getLastConfig: () => minimalHostStatus(),
    getLastRuntime: () => null,
  };
}

function createSessionRecorder(): ManagerNavigationSessions & {
  loading: boolean[];
  maintenanceShown: HostStatus[];
  networkShown: HostStatus[];
  wizardShown: Array<{ status: HostStatus | null; presentation: WizardPresentation }>;
  cleared: Array<'status' | 'maintenance' | 'network' | 'wizard'>;
} {
  const loading: boolean[] = [];
  const maintenanceShown: HostStatus[] = [];
  const networkShown: HostStatus[] = [];
  const wizardShown: Array<{ status: HostStatus | null; presentation: WizardPresentation }> = [];
  const cleared: Array<'status' | 'maintenance' | 'network' | 'wizard'> = [];

  return {
    loading,
    maintenanceShown,
    networkShown,
    wizardShown,
    cleared,
    clearInactive: (active) => {
      cleared.push(active);
    },
    setDeferredLoading: (_view, value) => {
      loading.push(value);
    },
    beginMaintenance: (status) => {
      maintenanceShown.push(status);
    },
    beginNetwork: (status) => {
      networkShown.push(status);
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
  assert.equal(sessions.maintenanceShown.length, 1);
});

test('does not show maintenance after navigating to network before refresh resolves', async () => {
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

  assert.equal(sessions.maintenanceShown.length, 0);
  assert.equal(sessions.networkShown.length, 1);
  assert.deepEqual(sessions.cleared, ['maintenance', 'network']);
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

test('defaultWizardPresentation uses fullscreen before env exists', () => {
  assert.equal(defaultWizardPresentation(null), 'fullscreen');
  assert.equal(defaultWizardPresentation(minimalHostStatus({ envExists: false })), 'fullscreen');
  assert.equal(defaultWizardPresentation(minimalHostStatus({ envExists: true })), 'embedded');
});

test('shouldAutoStartFullscreenWizard only before .env exists', () => {
  assert.equal(shouldAutoStartFullscreenWizard(null), true);
  assert.equal(shouldAutoStartFullscreenWizard(minimalHostStatus({ envExists: false })), true);
  assert.equal(shouldAutoStartFullscreenWizard(minimalHostStatus({ envExists: true })), false);
});
