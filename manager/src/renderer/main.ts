import { createHealthHeader } from './health-header.js';
import { createHostRefreshController } from './host-refresh-controller.js';
import { createManagerNavigation } from './manager-navigation.js';
import type { NavigateOptions, WizardPresentation } from './manager-navigation.js';
import { createManagerMainNav } from './manager-main-nav.js';
import { createMaintenanceView } from './maintenance-view.js';
import { createNetworkView } from './network-view.js';
import { renderStatusError, renderStatusView } from './status-view.js';
import { pickAndLoadReleaseArchive } from './delivery-images-flow.js';
import { createWizardView } from './wizard-view.js';
import { queryRequired } from './dom.js';
import type { ManagerView } from './host-refresh-controller.js';

const appShellEl = queryRequired<HTMLElement>(document, '#app-shell', 'Manager-UI');
const appChromeEl = queryRequired<HTMLElement>(document, '#app-chrome', 'Manager-UI');
const healthHeaderEl = queryRequired<HTMLElement>(document, '#health-header', 'Manager-UI');
const mainNavEl = queryRequired<HTMLElement>(document, '#main-nav', 'Manager-UI');
const statusView = queryRequired<HTMLElement>(document, '#status-view', 'Manager-UI');
const networkViewEl = queryRequired<HTMLElement>(document, '#network-view', 'Manager-UI');
const wizardView = queryRequired<HTMLElement>(document, '#wizard-view', 'Manager-UI');
const maintenanceViewEl = queryRequired<HTMLElement>(document, '#maintenance-view', 'Manager-UI');

let wizardPresentation: WizardPresentation = 'embedded';

function requirePraxisManager(): Window['praxisManager'] {
  const api = window.praxisManager;
  if (!api) {
    throw new Error(
      'Preload nicht geladen — Manager neu starten. (Hinweis: DevTools → Console nach Preload-Fehlern prüfen.)',
    );
  }
  return api;
}

const healthHeader = createHealthHeader(healthHeaderEl);

function isWizardFullscreen(): boolean {
  return wizardPresentation === 'fullscreen';
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
  if (options.wizardPresentation) {
    wizardPresentation = options.wizardPresentation;
  }

  const fullscreenWizard = view === 'wizard' && isWizardFullscreen();
  appShellEl.classList.toggle('is-wizard-fullscreen', fullscreenWizard);
  appChromeEl.hidden = fullscreenWizard;

  if (fullscreenWizard) {
    healthHeader.hide();
    mainNav.hide();
    return;
  }

  appChromeEl.hidden = false;
  healthHeader.show();
  healthHeaderEl.hidden = false;
  mainNav.show();
  mainNav.render({
    active: view,
    status: hostRefresh.getLastConfig(),
  });
}

const mainNav = createManagerMainNav(mainNavEl, (tab) => {
  if (tab === 'wizard') {
    const status = hostRefresh.getLastConfig();
    navigation.navigateTo('wizard', {
      wizardPresentation: status?.envExists ? 'embedded' : 'fullscreen',
    });
    return;
  }
  navigation.navigateTo(tab);
});

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
    healthHeader.render(runtime);
    const view = hostRefresh.getView();
    if (view === 'maintenance') {
      maintenance.applyRuntimeHealth(runtime);
    }
    if (view === 'network') {
      network.applyRuntimeHealth(runtime);
    }
    if (!isWizardFullscreen()) {
      mainNav.render({
        active: view,
        status: hostRefresh.getLastConfig(),
      });
    }
  },
  onConfig(status, view) {
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
    healthHeader.renderError(message);
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

navigation.navigateTo('status');
