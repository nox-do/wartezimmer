<script lang="ts">
  import type { ManagerView } from './host-refresh-controller.js';
  import MainNav from './MainNav.svelte';
  import StatusView from './StatusView.svelte';
  import MaintenanceView from './MaintenanceView.svelte';
  import NetworkView from './NetworkView.svelte';
  import WizardView from './WizardView.svelte';
  import { managerShell, showChrome, wizardFullscreen } from './manager-shell-state.svelte.js';

  let {
    onNavigateTab,
    onStatusSetupClick,
    onStatusLoadReleaseArchive,
    onStatusOpenUrl,
    onOpenNetwork,
    onAfterMutation,
    onWizardComplete,
    onWizardCancel,
  }: {
    onNavigateTab: (tab: ManagerView) => void;
    onStatusSetupClick: () => void;
    onStatusLoadReleaseArchive: () => void;
    onStatusOpenUrl: (url: string) => void;
    onOpenNetwork: () => void;
    onAfterMutation: () => void | Promise<void>;
    onWizardComplete: () => void;
    onWizardCancel: () => void;
  } = $props();
</script>

<div class="app-root" id="app-shell" class:is-wizard-fullscreen={wizardFullscreen(managerShell)}>
  <div class="app-chrome" id="app-chrome" hidden={!showChrome(managerShell)}>
    <MainNav onNavigate={onNavigateTab} />
  </div>

  <div class="app-shell">
    <div class="app-content">
      <StatusView
        onSetupClick={onStatusSetupClick}
        onLoadReleaseArchive={onStatusLoadReleaseArchive}
        onOpenUrl={onStatusOpenUrl}
        {onOpenNetwork}
        onOpenMaintenance={() => onNavigateTab('maintenance')}
        onRefresh={onAfterMutation}
      />
      <MaintenanceView {onAfterMutation} onReinstall={onStatusSetupClick} />
      <NetworkView {onAfterMutation} />
      <WizardView
        onComplete={onWizardComplete}
        onCancel={onWizardCancel}
        onHostMutated={onAfterMutation}
      />
    </div>
  </div>
</div>
