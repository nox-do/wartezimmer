import { mount } from 'svelte';
import App from './App.svelte';
import { createHostRefreshController } from './host-refresh-controller.js';
import { createManagerNavigation } from './manager-navigation.js';
import type { NavigateOptions } from './manager-navigation.js';
import { createMaintenanceView } from './maintenance-view.js';
import { createNetworkView } from './network-view.js';
import { renderStatusError, renderStatusView } from './status-view.js';
import { pickAndLoadReleaseArchive } from './delivery-images-flow.js';
import { createWizardView } from './wizard-view.js';
import { queryRequired } from './dom.js';
import type { ManagerView } from './host-refresh-controller.js';
import {
  applyHostStatus,
  applyRuntimeError,
  applyRuntimeHealth,
  applyShellNavigation,
} from './manager-shell-state.svelte.js';

let navigateTab: (tab: ManagerView) => void = () => {
  throw new Error('Manager-Navigation noch nicht initialisiert.');
};

const svelteRoot = document.getElementById('svelte-app');
if (!svelteRoot) {
  throw new Error('Svelte mount point #svelte-app missing');
}

mount(App, {
  target: svelteRoot,
  props: {
    onNavigateTab: (tab: ManagerView) => navigateTab(tab),
  },
});

mountLegacyManager();

function mountLegacyManager(): void {
  const statusView = queryRequired<HTMLElement>(document, '#status-view', 'Manager-UI');
  const networkViewEl = queryRequired<HTMLElement>(document, '#network-view', 'Manager-UI');
  const wizardView = queryRequired<HTMLElement>(document, '#wizard-view', 'Manager-UI');
  const maintenanceViewEl = queryRequired<HTMLElement>(document, '#maintenance-view', 'Manager-UI');

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
    statusView.hidden = view !== 'status';

    if (view !== 'maintenance') {
      maintenance.hide();
    }
    if (view !== 'network') {
      network.hide();
    }
    if (view !== 'wizard') {
      wizard.hide();
    }

    if (view === 'maintenance') {
      maintenanceViewEl.hidden = false;
    }
    if (view === 'network') {
      networkViewEl.hidden = false;
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
        renderStatusError(statusView, result.error ?? 'Release-Paket konnte nicht importiert werden.');
        return;
      }
      await hostRefresh.refresh({ scope: 'full', immediate: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Release-Paket konnte nicht importiert werden.';
      renderStatusError(statusView, message);
    }
  }

  function startFullscreenWizard(): void {
    navigation.navigateTo('wizard', { wizardPresentation: 'fullscreen' });
  }

  function renderStatusFromConfig(): void {
    const status = hostRefresh.getLastConfig();
    if (!status) {
      return;
    }
    const api = requirePraxisManager();
    renderStatusView(
      statusView,
      status,
      startFullscreenWizard,
      hostRefresh.getLastRuntime(),
      () => {
        void loadReleaseArchiveFromStatus();
      },
      (url) => {
        void api.openExternalUrl(url);
      },
    );
  }

  const maintenance = createMaintenanceView(maintenanceViewEl, requirePraxisManager(), {
    onAfterMutation: () => {
      void hostRefresh.refresh({ scope: 'full', immediate: true });
    },
  });

  const network = createNetworkView(networkViewEl, requirePraxisManager(), {
    onAfterMutation: () => {
      void hostRefresh.refresh({ scope: 'full', immediate: true });
    },
  });

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
      if (view === 'status') {
        renderStatusFromConfig();
      }
      if (view === 'maintenance') {
        maintenance.applyConfigSnapshot(status);
      }
      if (view === 'network') {
        network.applyConfigSnapshot(status);
      }
    },
    onError(message, view) {
      applyRuntimeError(message);
      if (view === 'status') {
        renderStatusError(statusView, message);
      }
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

  navigateTab = (tab) => {
    if (tab === 'wizard') {
      const status = hostRefresh.getLastConfig();
      navigation.navigateTo('wizard', {
        wizardPresentation: status?.envExists ? 'embedded' : 'fullscreen',
      });
      return;
    }
    navigation.navigateTo(tab);
  };

  navigation.navigateTo('status');
}
