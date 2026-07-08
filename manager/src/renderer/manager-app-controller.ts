import { createHostRefreshController } from './host-refresh-controller.js';
import {
  createManagerNavigation,
  defaultWizardPresentation,
} from './manager-navigation.js';
import type { NavigateOptions } from './manager-navigation.js';
import { pickAndLoadReleaseArchive } from './delivery-images-flow.js';
import { createWizardView } from './wizard-view.js';
import { queryRequired } from './dom.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { ManagerView } from './host-refresh-controller.js';
import {
  applyHostStatus,
  applyRuntimeError,
  applyRuntimeHealth,
  applyShellNavigation,
  applyStatusError,
} from './manager-shell-state.svelte.js';
import {
  getMaintenanceViewAdapter,
  setMaintenanceCallbacks,
  tryGetMaintenanceViewAdapter,
} from './maintenance-view-adapter.js';
import {
  getNetworkViewAdapter,
  setNetworkCallbacks,
  tryGetNetworkViewAdapter,
} from './network-view-adapter.js';

export type ManagerAppController = {
  navigateTab: (tab: ManagerView) => void;
  onStatusSetupClick: () => void;
  onStatusLoadReleaseArchive: () => void;
  onStatusOpenUrl: (url: string) => void;
};

export function createManagerAppController(doc: Document = document): ManagerAppController {
  const wizardView = queryRequired<HTMLElement>(doc, '#wizard-view', 'Manager-UI');

  function requirePraxisManager(): Window['praxisManager'] {
    const api = window.praxisManager;
    if (!api) {
      throw new Error(
        'Preload nicht geladen — Manager neu starten. (Hinweis: DevTools → Console nach Preload-Fehlern prüfen.)',
      );
    }
    return api;
  }

  function setDomView(view: ManagerView): void {
    if (view !== 'wizard') {
      wizard.hide();
    }
    if (view !== 'maintenance') {
      tryGetMaintenanceViewAdapter()?.hide();
    }
    if (view !== 'network') {
      tryGetNetworkViewAdapter()?.hide();
    }

    if (view === 'wizard') {
      wizardView.hidden = false;
    }
  }

  function syncShell(view: ManagerView, options: NavigateOptions = {}): void {
    applyShellNavigation(view, options);
  }

  async function loadReleaseArchiveFromStatus(): Promise<void> {
    try {
      const api = requirePraxisManager();
      const result = await pickAndLoadReleaseArchive(api);
      if (result.canceled) {
        return;
      }
      if (!result.ok) {
        applyStatusError(result.error ?? 'Release-Paket konnte nicht importiert werden.');
        return;
      }
      await hostRefresh.refresh({ scope: 'full', immediate: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Release-Paket konnte nicht importiert werden.';
      applyStatusError(message);
    }
  }

  function startFullscreenWizard(): void {
    navigation.navigateTo('wizard', { wizardPresentation: 'fullscreen' });
  }

  const maintenance = {
    show: (status: HostStatus) => {
      getMaintenanceViewAdapter().show(status);
    },
    hide: () => {
      tryGetMaintenanceViewAdapter()?.hide();
    },
    setLoading: (loading: boolean) => {
      tryGetMaintenanceViewAdapter()?.setLoading(loading);
    },
    applyConfigSnapshot: (status: HostStatus) => {
      getMaintenanceViewAdapter().applyConfigSnapshot(status);
    },
    applyRuntimeHealth: (health: HostRuntimeHealth) => {
      getMaintenanceViewAdapter().applyRuntimeHealth(health);
    },
  };

  const network = {
    show: (status: HostStatus) => {
      getNetworkViewAdapter().show(status);
    },
    hide: () => {
      tryGetNetworkViewAdapter()?.hide();
    },
    setLoading: (loading: boolean) => {
      tryGetNetworkViewAdapter()?.setLoading(loading);
    },
    applyConfigSnapshot: (status: HostStatus) => {
      getNetworkViewAdapter().applyConfigSnapshot(status);
    },
    applyRuntimeHealth: (health: HostRuntimeHealth) => {
      getNetworkViewAdapter().applyRuntimeHealth(health);
    },
  };

  const hostRefresh = createHostRefreshController({
    api: requirePraxisManager,
    onRuntime(runtime) {
      applyRuntimeHealth(runtime);
      const view = hostRefresh.getView();
      if (view === 'maintenance') {
        maintenance.applyRuntimeHealth(runtime);
      }
      if (view === 'network') {
        network.applyRuntimeHealth(runtime);
      }
    },
    onConfig(status, view) {
      applyHostStatus(status);
      syncShell(view);
      if (view === 'maintenance') {
        maintenance.applyConfigSnapshot(status);
      }
      if (view === 'network') {
        network.applyConfigSnapshot(status);
      }
    },
    onError(message) {
      applyRuntimeError(message);
    },
  });

  setMaintenanceCallbacks({
    onAfterMutation: () => {
      void hostRefresh.refresh({ scope: 'full', immediate: true });
    },
  });

  setNetworkCallbacks({
    onAfterMutation: () => {
      void hostRefresh.refresh({ scope: 'full', immediate: true });
    },
  });

  const wizard = createWizardView(wizardView, requirePraxisManager(), {
    onComplete: () => {
      navigation.navigateTo('status');
    },
    onCancel: () => {
      navigation.navigateTo('status');
    },
  });

  const navigation = createManagerNavigation({
    hostRefresh,
    syncShell,
    setDomView,
    views: {
      wizard,
      maintenance,
      network,
    },
    fetchSetupStatus: () => requirePraxisManager().fetchSetupStatus(),
  });

  function navigateTab(tab: ManagerView): void {
    if (tab === 'wizard') {
      const status = hostRefresh.getLastConfig();
      navigation.navigateTo('wizard', {
        wizardPresentation: defaultWizardPresentation(status),
      });
      return;
    }
    navigation.navigateTo(tab);
  }

  navigation.navigateTo('status');

  return {
    navigateTab,
    onStatusSetupClick: startFullscreenWizard,
    onStatusLoadReleaseArchive: () => {
      void loadReleaseArchiveFromStatus();
    },
    onStatusOpenUrl: (url: string) => {
      void requirePraxisManager().openExternalUrl(url);
    },
  };
}
