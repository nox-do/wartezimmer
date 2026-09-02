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
import { pickAndLoadReleaseArchive } from './delivery-images-flow.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';

export type ManagerAppShell = {
  applyConfigSnapshot: (status: HostStatus) => void;
  applyRuntimeSnapshot: (runtime: HostRuntimeHealth) => void;
  applyRuntimeError: (message: string) => void;
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
  api: () => PraxisManagerApi;
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

  function syncShell(view: ManagerView, options: NavigateOptions = {}): void {
    shell.applyShellNavigation(view, options);
  }

  async function refreshAfterMutation(): Promise<void> {
    await hostRefresh.refresh({ scope: 'config' });
    if (hostRefresh.getLastConfig()?.envExists) {
      await hostRefresh.refresh({ scope: 'runtime' });
    }
  }

  async function loadReleaseArchiveFromStatus(): Promise<void> {
    try {
      const result = await pickAndLoadReleaseArchive(deps.api());
      if (result.canceled) {
        return;
      }
      if (!result.ok) {
        shell.applyStatusError(result.error ?? 'Release-Paket konnte nicht importiert werden.');
        return;
      }
      await refreshAfterMutation();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Release-Paket konnte nicht importiert werden.';
      shell.applyStatusError(message);
    }
  }

  function startFullscreenWizard(): void {
    const status = hostRefresh.getLastConfig();
    navigation.navigateTo('wizard', {
      wizardPresentation: 'fullscreen',
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
    onError(message, _view, source) {
      if (source === 'config') {
        shell.applyStatusError(message);
      } else {
        shell.applyRuntimeError(message);
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
      const status = hostRefresh.getLastConfig();
      navigation.navigateTo('wizard', {
        wizardPresentation: defaultWizardPresentation(status),
        ...(status ? { status } : {}),
      });
      return;
    }
    navigation.navigateTo(tab);
  }

  function onWizardLeave(): void {
    navigation.navigateTo('status', { refresh: false });
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
        if (hostRefresh.getLastConfig()?.envExists) {
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
    onStatusSetupClick: startFullscreenWizard,
    onStatusLoadReleaseArchive: () => {
      void loadReleaseArchiveFromStatus();
    },
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
