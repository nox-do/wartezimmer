import type { HostRefreshController, ManagerView } from './host-refresh-controller.js';
import type { HostStatus } from '../shared/host-status.js';

export type WizardPresentation = 'fullscreen' | 'embedded';

export function defaultWizardPresentation(status: HostStatus | null): WizardPresentation {
  return status?.envExists ? 'embedded' : 'fullscreen';
}

/** Erstinstallation ohne `.env` → Wizard fullscreen ohne Tabs (siehe manager/README). */
export function shouldAutoStartFullscreenWizard(status: HostStatus | null): boolean {
  return !status?.envExists;
}

export type NavigateOptions = {
  wizardPresentation?: WizardPresentation;
  /** Skip a second status fetch when the caller already has config. */
  status?: HostStatus | null;
  /** Skip host refresh when config is already in the snapshot (boot / wizard leave). */
  refresh?: boolean;
};

export type DeferredView = 'maintenance' | 'network';

export type ManagerNavigationSessions = {
  clearInactive: (active: ManagerView) => void;
  setDeferredLoading: (view: DeferredView, loading: boolean) => void;
  beginMaintenance: () => void;
  beginNetwork: () => void;
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
      if (Object.hasOwn(options, 'status')) {
        deps.sessions.beginWizard(options.status ?? null, presentation);
        return;
      }
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

    if (options.refresh === false) {
      return;
    }

    if (isDeferredView(view)) {
      deps.sessions.setDeferredLoading(view, true);
    }

    void deps.hostRefresh.refresh({ scope: 'full' }).then(() => {
      if (deps.hostRefresh.getView() !== view) {
        if (isDeferredView(view)) {
          deps.sessions.setDeferredLoading(view, false);
        }
        return;
      }
      if (!isDeferredView(view)) {
        return;
      }
      // Full refresh has written configSnapshot; session is only a generation trigger.
      if (deps.hostRefresh.getLastConfig()) {
        if (view === 'maintenance') {
          deps.sessions.beginMaintenance();
        } else {
          deps.sessions.beginNetwork();
        }
      }
      deps.sessions.setDeferredLoading(view, false);
    });
  }

  return { navigateTo };
}
