import { createHostRefreshController } from './host-refresh-controller.js';
import { createManagerNavigation, defaultWizardPresentation, shouldAutoStartFullscreenWizard } from './manager-navigation.js';
import type { NavigateOptions } from './manager-navigation.js';
import { pickAndLoadReleaseArchive } from './delivery-images-flow.js';
import type { ManagerView } from './host-refresh-controller.js';
import {
  applyHostStatus,
  applyRuntimeError,
  applyRuntimeHealth,
  applyShellNavigation,
  applyStatusError,
  beginMaintenanceSession,
  beginNetworkSession,
  beginWizardSession,
  clearInactiveViewSessions,
  setDeferredViewLoading,
} from './manager-shell-state.svelte.js';

export type ManagerAppController = {
  start: () => void;
  navigateTab: (tab: ManagerView) => void;
  onStatusSetupClick: () => void;
  onStatusLoadReleaseArchive: () => void;
  onStatusOpenUrl: (url: string) => void;
  onAfterMutation: () => void;
  onWizardComplete: () => void;
  onWizardCancel: () => void;
};

export function createManagerAppController(): ManagerAppController {
  function requirePraxisManager(): Window['praxisManager'] {
    const api = window.praxisManager;
    if (!api) {
      throw new Error(
        'Preload nicht geladen — Manager neu starten. (Hinweis: DevTools → Console nach Preload-Fehlern prüfen.)',
      );
    }
    return api;
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

  let bootRouteResolved = false;

  const hostRefresh = createHostRefreshController({
    api: requirePraxisManager,
    onRuntime(runtime) {
      applyRuntimeHealth(runtime);
    },
    onConfig(status, view) {
      applyHostStatus(status);
      if (!bootRouteResolved && view === 'status') {
        bootRouteResolved = true;
        if (shouldAutoStartFullscreenWizard(status)) {
          navigation.navigateTo('wizard', { wizardPresentation: 'fullscreen' });
          return;
        }
      }
      syncShell(view);
    },
    onError(message) {
      applyRuntimeError(message);
    },
  });

  const navigation = createManagerNavigation({
    hostRefresh,
    syncShell,
    sessions: {
      clearInactive: clearInactiveViewSessions,
      setDeferredLoading: setDeferredViewLoading,
      beginMaintenance: beginMaintenanceSession,
      beginNetwork: beginNetworkSession,
      beginWizard: beginWizardSession,
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

  function onAfterMutation(): void {
    void hostRefresh.refresh({ scope: 'full', immediate: true });
  }

  function onWizardLeave(): void {
    navigation.navigateTo('status');
  }

  return {
    start: () => {
      navigation.navigateTo('status');
    },
    navigateTab,
    onStatusSetupClick: startFullscreenWizard,
    onStatusLoadReleaseArchive: () => {
      void loadReleaseArchiveFromStatus();
    },
    onStatusOpenUrl: (url: string) => {
      void requirePraxisManager().openExternalUrl(url);
    },
    onAfterMutation,
    onWizardComplete: onWizardLeave,
    onWizardCancel: onWizardLeave,
  };
}
