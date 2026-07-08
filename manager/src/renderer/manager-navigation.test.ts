import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostRefreshController } from './host-refresh-controller.js';
import { createManagerNavigation, defaultWizardPresentation } from './manager-navigation.js';
import type { HostStatus } from '../shared/host-status.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/pf',
    mode: 'install',
    composeProjectName: 'pf-test',
    projectRoot: '/tmp/pf',
    envExists: true,
    envPath: '/tmp/pf/.env',
    practiceDisplayName: 'Test',
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/tmp/imports', exports: '/tmp/exports' },
    appBaseUrl: 'http://192.168.1.10:8080',
    network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
    gateway: null,
    deviceUrls: null,
    probes: [],
    compose: { running: true, services: [] },
    sandboxScanner: null,
    networkBindings: [],
    deliveryImages: {
      required: false,
      configured: true,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: true,
      sandboxPresent: true,
      ready: true,
    },
    ...overrides,
  };
}

function createMockHostRefresh(options: {
  getView: () => 'status' | 'maintenance' | 'network' | 'wizard';
  refresh?: () => Promise<void>;
}): HostRefreshController {
  return {
    getView: options.getView,
    setView: () => {},
    refresh: options.refresh ?? (async () => {}),
    getLastConfig: () => minimalStatus(),
    getLastRuntime: () => null,
  };
}

test('deferred view shows loading until refresh completes', async () => {
  let resolveRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    resolveRefresh = resolve;
  });

  const loading: boolean[] = [];

  const navigation = createManagerNavigation({
    hostRefresh: createMockHostRefresh({
      getView: () => 'maintenance',
      refresh: async () => {
        await refreshGate;
      },
    }),
    syncShell: () => {},
    setDomView: () => {},
    views: {
      wizard: { show: () => {}, hide: () => {} },
      maintenance: {
        show: () => {},
        hide: () => {},
        setLoading: (value) => loading.push(value),
      },
      network: {
        show: () => {},
        hide: () => {},
        setLoading: () => {},
      },
    },
    fetchSetupStatus: async () => minimalStatus(),
  });

  navigation.navigateTo('maintenance');
  assert.deepEqual(loading, [true]);
  resolveRefresh();
  await refreshGate;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(loading, [true, false]);
});

test('does not show maintenance after navigating to network before refresh resolves', async () => {
  let currentView: 'status' | 'maintenance' | 'network' | 'wizard' = 'status';
  let resolveRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    resolveRefresh = resolve;
  });

  const maintenanceShown: HostStatus[] = [];
  const networkShown: HostStatus[] = [];

  const navigation = createManagerNavigation({
    hostRefresh: {
      getView: () => currentView,
      setView: (view) => {
        currentView = view;
      },
      refresh: async () => {
        await refreshGate;
      },
      getLastConfig: () => minimalStatus({ practiceDisplayName: 'Fresh' }),
      getLastRuntime: () => null,
    },
    syncShell: () => {},
    setDomView: () => {},
    views: {
      wizard: { show: () => {}, hide: () => {} },
      maintenance: {
        show: (status) => maintenanceShown.push(status),
        hide: () => {},
        setLoading: () => {},
      },
      network: {
        show: (status) => networkShown.push(status),
        hide: () => {},
        setLoading: () => {},
      },
    },
    fetchSetupStatus: async () => minimalStatus(),
  });

  navigation.navigateTo('maintenance');
  navigation.navigateTo('network');
  resolveRefresh();
  await refreshGate;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(maintenanceShown.length, 0);
  assert.equal(networkShown.length, 1);
});

test('does not show wizard after leaving wizard before fetch resolves', async () => {
  let currentView: 'status' | 'maintenance' | 'network' | 'wizard' = 'status';
  let resolveFetch!: (value: HostStatus) => void;
  const fetchGate = new Promise<HostStatus>((resolve) => {
    resolveFetch = resolve;
  });

  const wizardShown: Array<{ status: HostStatus | null; presentation: string }> = [];

  const navigation = createManagerNavigation({
    hostRefresh: createMockHostRefresh({
      getView: () => currentView,
    }),
    syncShell: () => {},
    setDomView: () => {},
    views: {
      wizard: {
        show: (status, presentation) => wizardShown.push({ status, presentation }),
        hide: () => {},
      },
      maintenance: {
        show: () => {},
        hide: () => {},
        setLoading: () => {},
      },
      network: {
        show: () => {},
        hide: () => {},
        setLoading: () => {},
      },
    },
    fetchSetupStatus: () => fetchGate,
  });

  navigation.navigateTo('wizard');
  currentView = 'status';
  resolveFetch(minimalStatus());
  await fetchGate;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(wizardShown.length, 0);
});

test('defaultWizardPresentation uses fullscreen before env exists', () => {
  assert.equal(defaultWizardPresentation(null), 'fullscreen');
  assert.equal(
    defaultWizardPresentation(minimalStatus({ envExists: false })),
    'fullscreen',
  );
  assert.equal(defaultWizardPresentation(minimalStatus({ envExists: true })), 'embedded');
});
