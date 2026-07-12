<script lang="ts">
  import { onMount } from 'svelte';
  import { mountFloatingPanel } from './floating-panel.js';
  import { buildTvKioskLinuxCommand, buildTvKioskWindowsCommand } from './tv-kiosk-commands.js';

  let { tvUrl }: { tvUrl: string } = $props();

  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLDivElement | null>(null);

  const linuxCommand = $derived(buildTvKioskLinuxCommand(tvUrl));
  const windowsCommand = $derived(buildTvKioskWindowsCommand(tvUrl));

  onMount(() => {
    if (!trigger || !panel) {
      return;
    }
    return mountFloatingPanel(trigger, panel);
  });
</script>

<div class="device-url-tip">
  <button
    bind:this={trigger}
    type="button"
    class="btn-icon btn-icon-muted info-tip-trigger"
    aria-label="Kiosk-Start für Wartezimmer-TV"
  >
    <svg
      class="icon"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M12 16v-4"></path>
      <path d="M12 8h.01"></path>
    </svg>
  </button>
  <div bind:this={panel} class="info-tip-panel device-url-kiosk-tip" role="tooltip">
    <p>
      Mini-PC am TV: Kiosk-Browser starten (Gong ohne Maus/Klick). Verknüpfung oder Autostart mit
      gleichen Optionen anlegen.
    </p>
    <p><strong>Linux</strong></p>
    <pre class="device-url-kiosk-command">{linuxCommand}</pre>
    <p><strong>Windows</strong></p>
    <pre class="device-url-kiosk-command">{windowsCommand}</pre>
  </div>
</div>
