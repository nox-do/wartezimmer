<script lang="ts">
  import { onMount } from 'svelte';
  import { mountFloatingPanel } from './floating-panel.js';
  import {
    buildTvKioskMacCommand,
    buildTvKioskLinuxCommand,
    buildTvKioskWindowsCommand,
  } from './tv-kiosk-commands.js';

  let { tvUrl }: { tvUrl: string } = $props();

  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLDivElement | null>(null);

  const macCommand = $derived(buildTvKioskMacCommand(tvUrl));
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
      Rechner am TV: Kiosk-Browser mit Tonfreigabe starten. Den Browser vorher vollständig beenden.
      Für Autostart dieselben Optionen verwenden.
    </p>
    <p><strong>macOS · Terminal</strong></p>
    <pre class="device-url-kiosk-command">{macCommand}</pre>
    <p><strong>Windows · Ziel einer Chrome-Verknüpfung</strong></p>
    <pre class="device-url-kiosk-command">{windowsCommand}</pre>
    <p>Den Chrome-Pfad bei abweichender Installation anpassen.</p>
    <p><strong>Linux · Terminal</strong></p>
    <pre class="device-url-kiosk-command">{linuxCommand}</pre>
    <p>Je nach Distribution heißt der Browser chromium oder chromium-browser.</p>
    <p><strong>Android</strong></p>
    <p>
      TV-Adresse im Browser öffnen und das Gerät koppeln. Für dauerhaften Betrieb einen
      Kiosk-Browser mit Vollbild, Autostart, dauerhaft eingeschaltetem Display und Tonfreigabe
      verwenden. Im normalen Browser kann für den Gong eine Berührung erforderlich sein.
    </p>
  </div>
</div>
