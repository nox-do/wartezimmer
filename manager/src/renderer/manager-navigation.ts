import type { HostRefreshController, ManagerView } from './host-refresh-controller.js';
import type { HostStatus } from '../shared/host-status.js';

export type DeferredView = 'maintenance' | 'network';

export type ManagerNavigationViews = {
  wizard: {
    show: (status: HostStatus | null) => void;
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
  healthHeader: { hide: () => void };
  syncHealthHeaderVisibility: (view: ManagerView, config: HostStatus | null) => void;
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

  function navigateTo(view: ManagerView): void {
    deps.hostRefresh.setView(view);
    deps.setDomView(view);

    if (view === 'wizard') {
      deps.healthHeader.hide();
      void (async () => {
        try {
          const status = await deps.fetchSetupStatus();
          if (deps.hostRefresh.getView() !== 'wizard') {
            return;
          }
          deps.views.wizard.show(status);
        } catch {
          if (deps.hostRefresh.getView() !== 'wizard') {
            return;
          }
          deps.views.wizard.show(null);
        }
      })();
      return;
    }

    const config = deps.hostRefresh.getLastConfig();
    deps.syncHealthHeaderVisibility(view, config);

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
