import { mount } from 'svelte';
import App from './App.svelte';
import { createManagerAppController } from './manager-app-controller.js';
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

const svelteRoot = document.getElementById('svelte-app');
if (!svelteRoot) {
  throw new Error('Svelte mount point #svelte-app missing');
}

function requirePraxisManager(): Window['praxisManager'] {
  const api = window.praxisManager;
  if (!api) {
    throw new Error(
      'Preload nicht geladen — Manager neu starten. (Hinweis: DevTools → Console nach Preload-Fehlern prüfen.)',
    );
  }
  return api;
}

const controller = createManagerAppController({
  api: requirePraxisManager,
  shell: {
    applyConfigSnapshot,
    applyRuntimeSnapshot,
    applyRuntimeError,
    applyStatusError,
    markBootReady,
    applyShellNavigation,
    beginMaintenanceSession,
    beginNetworkSession,
    beginWizardSession,
    clearInactiveViewSessions,
    setDeferredViewLoading,
  },
});

mount(App, {
  target: svelteRoot,
  props: {
    onNavigateTab: (tab: ManagerView) => {
      controller.navigateTab(tab);
    },
    onStatusSetupClick: () => {
      controller.onStatusSetupClick();
    },
    onStatusLoadReleaseArchive: () => {
      controller.onStatusLoadReleaseArchive();
    },
    onStatusOpenUrl: (url: string) => {
      controller.onStatusOpenUrl(url);
    },
    onOpenNetwork: () => {
      controller.onOpenNetwork();
    },
    onAfterMutation: () => controller.onAfterMutation(),
    onWizardComplete: () => {
      controller.onWizardComplete();
    },
    onWizardCancel: () => {
      controller.onWizardCancel();
    },
  },
});

void controller.start();
