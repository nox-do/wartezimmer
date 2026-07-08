<script lang="ts">
  import { onMount } from 'svelte';
  import { mountFloatingPanel } from './floating-panel.js';
  import { createLucideIcon } from './lucide-icons.js';
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
    trigger.append(createLucideIcon('info'));
    return mountFloatingPanel(trigger, panel);
  });
</script>

<div class="device-url-tip">
  <button
    bind:this={trigger}
    type="button"
    class="btn-icon btn-icon-muted info-tip-trigger"
    aria-label="Kiosk-Start für Wartezimmer-TV"
  ></button>
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
