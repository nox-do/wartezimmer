import { tabDisabled } from './manager-main-nav.js';
import type { ManagerError } from '@wartezimmer/server-shared/setup-api';
import {
  createHostRefreshController,
  type HostRefreshController,
  type HostRefreshControllerDeps,
  type ManagerView,
} from './host-refresh-controller.js';
import {
  createManagerNavigation,
  defaultWizardPresentation,
  shouldAutoStartFullscreenWizard,
} from './manager-navigation.js';
import type { NavigateOptions, WizardPresentation } from './manager-navigation.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';

export type ManagerAppShell = {
  applyConfigSnapshot: (status: HostStatus) => void;
  applyRuntimeSnapshot: (runtime: HostRuntimeHealth) => void;
  applyRuntimeError: (error: ManagerError) => void;
  applyStatusError: (message: string) => void;
  markBootReady: () => void;
  applyShellNavigation: (view: ManagerView, options?: NavigateOptions) => void;
  beginMaintenanceSession: () => void;
  beginNetworkSession: () => void;
  beginWizardSession: (status: HostStatus | null, presentation: WizardPresentation) => void;
  clearInactiveViewSessions: (active: ManagerView) => void;
  setDeferredViewLoading: (view: 'maintenance' | 'network', loading: boolean) => void;
};

export type ManagerAppControllerDeps = {
  api: () => WartezimmerManagerApi;
  shell: ManagerAppShell;
  createHostRefresh?: (deps: HostRefreshControllerDeps) => HostRefreshController;
};

export type ManagerAppController = {
  start: () => Promise<void>;
  navigateTab: (tab: ManagerView) => void;
  onStatusSetupClick: () => void;
  onStatusLoadReleaseArchive: () => void;
  onStatusOpenUrl: (url: string) => void;
  onOpenNetwork: () => void;
  onAfterMutation: () => Promise<void>;
  onWizardComplete: () => void;
  onWizardCancel: () => void;
};

export function createManagerAppController(deps: ManagerAppControllerDeps): ManagerAppController {
  const shell = deps.shell;
  const createHostRefresh = deps.createHostRefresh ?? createHostRefreshController;
  let mutationRefreshChain: Promise<void> = Promise.resolve();

  function syncShell(view: ManagerView, options: NavigateOptions = {}): void {
    shell.applyShellNavigation(view, options);
  }

  function refreshAfterMutation(): Promise<void> {
    const refresh = mutationRefreshChain.then(async () => {
      await hostRefresh.refresh({ scope: 'mutation' });
    });
    mutationRefreshChain = refresh.catch(() => undefined);
    return refresh;
  }

  function startSetupWizard(): void {
    const status = hostRefresh.getLastConfig();
    if (tabDisabled('wizard', status)) {
      navigation.navigateTo('status');
      return;
    }
    navigation.navigateTo('wizard', {
      wizardPresentation: defaultWizardPresentation(status),
      ...(status ? { status } : {}),
    });
  }

  const hostRefresh = createHostRefresh({
    api: deps.api,
    onRuntime(runtime) {
      shell.applyRuntimeSnapshot(runtime);
    },
    onConfig(status) {
      shell.applyConfigSnapshot(status);
    },
    onError(message, _view, source, error) {
      if (source === 'config') {
        shell.applyStatusError(message);
      } else {
        shell.applyRuntimeError(error);
      }
    },
  });

  const navigation = createManagerNavigation({
    hostRefresh,
    syncShell,
    sessions: {
      clearInactive: shell.clearInactiveViewSessions,
      setDeferredLoading: shell.setDeferredViewLoading,
      beginMaintenance: shell.beginMaintenanceSession,
      beginNetwork: shell.beginNetworkSession,
      beginWizard: shell.beginWizardSession,
    },
    fetchSetupStatus: () => deps.api().fetchSetupStatus(),
  });

  function navigateTab(tab: ManagerView): void {
    if (tab === 'wizard') {
      startSetupWizard();
      return;
    }
    if (
      (tab === 'maintenance' || tab === 'network') &&
      hostRefresh.getLastConfig()?.installation?.kind !== 'healthy'
    ) {
      navigation.navigateTo('status');
      return;
    }
    navigation.navigateTo(tab);
  }

  function onWizardLeave(): void {
    navigation.navigateTo('status');
  }

  return {
    start: async () => {
      try {
        const status = await hostRefresh.refresh({ scope: 'config' });
        if (status && shouldAutoStartFullscreenWizard(status)) {
          navigation.navigateTo('wizard', {
            wizardPresentation: 'fullscreen',
            status,
          });
          shell.markBootReady();
          return;
        }
        navigation.navigateTo('status', { refresh: false });
        shell.markBootReady();
        if (hostRefresh.getLastConfig()?.envExists !== false) {
          await hostRefresh.refresh({ scope: 'runtime' });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Setup-API nicht erreichbar — bitte Manager neu starten.';
        shell.applyStatusError(message);
        navigation.navigateTo('status', { refresh: false });
        shell.markBootReady();
      }
    },
    navigateTab,
    onStatusSetupClick: startSetupWizard,
    onStatusLoadReleaseArchive: startSetupWizard,
    onStatusOpenUrl: (url: string) => {
      void deps.api().openExternalUrl(url);
    },
    onOpenNetwork: () => {
      navigateTab('network');
    },
    onAfterMutation: refreshAfterMutation,
    onWizardComplete: onWizardLeave,
    onWizardCancel: onWizardLeave,
  };
}
