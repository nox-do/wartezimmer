<script lang="ts">
  import type { ManagerView } from './host-refresh-controller.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import { TAB_LABELS, TAB_ORDER, tabDisabled } from './manager-main-nav.js';

  let { onNavigate }: { onNavigate: (tab: ManagerView) => void } = $props();
</script>

<nav id="main-nav" class="main-nav" aria-label="Hauptnavigation">
  {#each TAB_ORDER as tab (tab)}
    {@const disabledReason = tabDisabled(tab, managerShell.hostStatus)}
    <button
      type="button"
      class="main-nav-tab"
      class:is-active={managerShell.activeView === tab}
      data-tab={tab}
      disabled={disabledReason !== null}
      title={disabledReason ?? ''}
      aria-current={managerShell.activeView === tab ? 'page' : undefined}
      onclick={() => {
        if (disabledReason === null) {
          onNavigate(tab);
        }
      }}
    >
      {TAB_LABELS[tab]}
    </button>
  {/each}
</nav>
