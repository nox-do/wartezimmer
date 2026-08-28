import { mount } from 'svelte';
import App from './App.svelte';
import { createManagerAppController } from './manager-app-controller.js';
import type { ManagerView } from './host-refresh-controller.js';

const svelteRoot = document.getElementById('svelte-app');
if (!svelteRoot) {
  throw new Error('Svelte mount point #svelte-app missing');
}

const controller = createManagerAppController();

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

controller.start();
