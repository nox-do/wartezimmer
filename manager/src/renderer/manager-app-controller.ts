import { createHostRefreshController } from './host-refresh-controller.js';
import {
  createManagerNavigation,
  defaultWizardPresentation,
  shouldAutoStartFullscreenWizard,
} from './manager-navigation.js';
import type { NavigateOptions } from './manager-navigation.js';
import { pickAndLoadReleaseArchive } from './delivery-images-flow.js';
import type { ManagerView } from './host-refresh-controller.js';
import {
  applyConfigSnapshot,
  applyRuntimeError,
  applyRuntimeSnapshot,
  applyShellNavigation,
  applyStatusError,
  markBootReady,
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
  onOpenNetwork: () => void;
  onAfterMutation: () => Promise<void>;
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
    const status = hostRefresh.getLastConfig();
    navigation.navigateTo('wizard', {
      wizardPresentation: 'fullscreen',
      ...(status ? { status } : {}),
    });
  }

  let bootRouteResolved = false;

  const hostRefresh = createHostRefreshController({
    api: requirePraxisManager,
    onRuntime(runtime) {
      applyRuntimeSnapshot(runtime);
    },
    onConfig(status, view) {
      applyConfigSnapshot(status);
      markBootReady();
      if (!bootRouteResolved && view === 'status') {
        bootRouteResolved = true;
        if (shouldAutoStartFullscreenWizard(status)) {
          navigation.navigateTo('wizard', {
            wizardPresentation: 'fullscreen',
            status,
          });
          return;
        }
      }
      syncShell(view);
    },
    onError(message, _view, source) {
      if (source === 'config') {
        applyStatusError(message);
        markBootReady();
      } else {
        applyRuntimeError(message);
      }
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
        ...(status ? { status } : {}),
      });
      return;
    }
    navigation.navigateTo(tab);
  }

  function onAfterMutation(): Promise<void> {
    return hostRefresh.refresh({ scope: 'full', immediate: true });
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
    onOpenNetwork: () => {
      navigateTab('network');
    },
    onAfterMutation,
    onWizardComplete: onWizardLeave,
    onWizardCancel: onWizardLeave,
  };
}
