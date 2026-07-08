<script lang="ts">
  import type { ManagerView } from './host-refresh-controller.js';
  import HealthHeader from './HealthHeader.svelte';
  import LegacyViewContainers from './LegacyViewContainers.svelte';
  import MainNav from './MainNav.svelte';
  import { managerShell, showChrome, wizardFullscreen } from './manager-shell-state.svelte.js';

  let { onNavigateTab }: { onNavigateTab: (tab: ManagerView) => void } = $props();
</script>

<div class="app-root" id="app-shell" class:is-wizard-fullscreen={wizardFullscreen(managerShell)}>
  <div class="app-chrome" id="app-chrome" hidden={!showChrome(managerShell)}>
    <HealthHeader />
    <MainNav onNavigate={onNavigateTab} />
  </div>

  <div class="app-shell">
    <div class="app-content">
      <LegacyViewContainers />
    </div>
  </div>
</div>
