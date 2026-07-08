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

export type ManagerNavigationViews = {
  wizard: {
    show: (status: HostStatus | null, presentation: WizardPresentation) => void;
    hide: () => void;
  };
  maintenance: {
    show: (status: HostStatus) => void;
    hide: () => void;
    setLoading: (loading: boolean) => void;
  };
  network: {
    show: (status: HostStatus) => void;
    hide: () => void;
    setLoading: (loading: boolean) => void;
  };
};

export type ManagerNavigationDeps = {
  hostRefresh: HostRefreshController;
  syncShell: (view: ManagerView, options?: NavigateOptions) => void;
  setDomView: (view: ManagerView) => void;
  views: ManagerNavigationViews;
  fetchSetupStatus: () => Promise<HostStatus>;
};

function isDeferredView(view: ManagerView): view is DeferredView {
  return view === 'maintenance' || view === 'network';
}

export function createManagerNavigation(deps: ManagerNavigationDeps) {
  function setDeferredViewLoading(view: DeferredView, loading: boolean): void {
    deps.views[view].setLoading(loading);
  }

  function navigateTo(view: ManagerView, options: NavigateOptions = {}): void {
    deps.hostRefresh.setView(view);
    deps.setDomView(view);
    deps.syncShell(view, options);

    if (view === 'wizard') {
      const presentation = options.wizardPresentation ?? 'embedded';
      void (async () => {
        try {
          const status = await deps.fetchSetupStatus();
          if (deps.hostRefresh.getView() !== 'wizard') {
            return;
          }
          deps.views.wizard.show(status, presentation);
        } catch {
          if (deps.hostRefresh.getView() !== 'wizard') {
            return;
          }
          deps.views.wizard.show(null, presentation);
        }
      })();
      return;
    }

    if (isDeferredView(view)) {
      setDeferredViewLoading(view, true);
    }

    void deps.hostRefresh.refresh({ scope: 'full', immediate: true }).then(() => {
      if (deps.hostRefresh.getView() !== view) {
        if (isDeferredView(view)) {
          setDeferredViewLoading(view, false);
        }
        return;
      }
      if (!isDeferredView(view)) {
        return;
      }
      const refreshed = deps.hostRefresh.getLastConfig();
      if (refreshed) {
        deps.views[view].show(refreshed);
      }
      setDeferredViewLoading(view, false);
    });
  }

  return { navigateTo };
}
