import type { HostRefreshController, ManagerView } from './host-refresh-controller.js';
import type { HostStatus } from '../shared/host-status.js';

export type WizardPresentation = 'fullscreen' | 'embedded';

export function defaultWizardPresentation(status: HostStatus | null): WizardPresentation {
  return status?.envExists ? 'embedded' : 'fullscreen';
}

export type NavigateOptions = {
  wizardPresentation?: WizardPresentation;
};

export type DeferredView = 'maintenance' | 'network';

export type ManagerNavigationSessions = {
  clearInactive: (active: ManagerView) => void;
  setDeferredLoading: (view: DeferredView, loading: boolean) => void;
  beginMaintenance: (status: HostStatus) => void;
  beginNetwork: (status: HostStatus) => void;
  beginWizard: (status: HostStatus | null, presentation: WizardPresentation) => void;
};

export type ManagerNavigationDeps = {
  hostRefresh: HostRefreshController;
  syncShell: (view: ManagerView, options?: NavigateOptions) => void;
  sessions: ManagerNavigationSessions;
  fetchSetupStatus: () => Promise<HostStatus>;
};

function isDeferredView(view: ManagerView): view is DeferredView {
  return view === 'maintenance' || view === 'network';
}

export function createManagerNavigation(deps: ManagerNavigationDeps) {
  function navigateTo(view: ManagerView, options: NavigateOptions = {}): void {
    deps.hostRefresh.setView(view);
    deps.sessions.clearInactive(view);
    deps.syncShell(view, options);

    if (view === 'wizard') {
      const presentation = options.wizardPresentation ?? 'embedded';
      void (async () => {
        try {
          const status = await deps.fetchSetupStatus();
          if (deps.hostRefresh.getView() !== 'wizard') {
            return;
          }
          deps.sessions.beginWizard(status, presentation);
        } catch {
          if (deps.hostRefresh.getView() !== 'wizard') {
            return;
          }
          deps.sessions.beginWizard(null, presentation);
        }
      })();
      return;
    }

    if (isDeferredView(view)) {
      deps.sessions.setDeferredLoading(view, true);
    }

    void deps.hostRefresh.refresh({ scope: 'full', immediate: true }).then(() => {
      if (deps.hostRefresh.getView() !== view) {
        if (isDeferredView(view)) {
          deps.sessions.setDeferredLoading(view, false);
        }
        return;
      }
      if (!isDeferredView(view)) {
        return;
      }
      const refreshed = deps.hostRefresh.getLastConfig();
      if (refreshed) {
        if (view === 'maintenance') {
          deps.sessions.beginMaintenance(refreshed);
        } else {
          deps.sessions.beginNetwork(refreshed);
        }
      }
      deps.sessions.setDeferredLoading(view, false);
    });
  }

  return { navigateTo };
}
