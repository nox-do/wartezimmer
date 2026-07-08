import { mount } from 'svelte';
import App from './App.svelte';
import {
  createManagerAppController,
  type ManagerAppController,
} from './manager-app-controller.js';
import type { ManagerView } from './host-refresh-controller.js';

const svelteRoot = document.getElementById('svelte-app');
if (!svelteRoot) {
  throw new Error('Svelte mount point #svelte-app missing');
}

let controller: ManagerAppController | null = null;

mount(App, {
  target: svelteRoot,
  props: {
    onNavigateTab: (tab: ManagerView) => {
      if (!controller) {
        throw new Error('Manager-Navigation noch nicht initialisiert.');
      }
      controller.navigateTab(tab);
    },
  },
});

controller = createManagerAppController();
