<script lang="ts">
  import '$lib/styles/terminal.css';
  import { onMount } from 'svelte';
  import DevicePairingPrompt from '$lib/components/auth/DevicePairingPrompt.svelte';
  import PatientLangPicker from '$lib/components/shared/PatientLangPicker.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { portal } from '$lib/actions/portal';
  import TerminalPrintSettingsModal from '$lib/components/terminal/TerminalPrintSettingsModal.svelte';
  import TerminalReceiptPrintHost from '$lib/components/terminal/TerminalReceiptPrintHost.svelte';
  import {
    mountTerminalOpsRuntime,
    terminalOps,
    terminalPairingUi,
  } from '$lib/terminal/terminal-ops-runtime.svelte';

  let { children } = $props();

  let printSettingsOpen = $state(false);
  let printHotspotTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPrintHotspotTimer() {
    if (printHotspotTimer) {
      clearTimeout(printHotspotTimer);
      printHotspotTimer = null;
    }
  }

  function startPrintHotspotPress() {
    clearPrintHotspotTimer();
    printHotspotTimer = setTimeout(() => {
      printHotspotTimer = null;
      printSettingsOpen = true;
    }, 2500);
  }

  onMount(() =>
    mountTerminalOpsRuntime({
      pairingMessages: {
        startError: t('terminal.pairingStartError'),
        statusError: t('terminal.pairingStatusError'),
        expired: t('terminal.pairingExpired'),
      },
    }),
  );
</script>

<div class="terminal-page">
  <PatientLangPicker enabledLocales={terminalOps.terminalPatientLocales} />
  <div class="terminal-print-setup-hotspot-wrap" use:portal={9990}>
    <button
      type="button"
      class="terminal-print-setup-hotspot"
      aria-label={t('terminal.printSettingsHotspotAria')}
      tabindex="-1"
      onpointerdown={startPrintHotspotPress}
      onpointerup={clearPrintHotspotTimer}
      onpointercancel={clearPrintHotspotTimer}
      oncontextmenu={(event) => event.preventDefault()}
    ></button>
  </div>
  <TerminalPrintSettingsModal bind:open={printSettingsOpen} />
  {#if terminalOps.deviceAuthorized}
    <TerminalReceiptPrintHost />
    {@render children()}
  {:else}
    <DevicePairingPrompt
      titleKey="terminal.pairingTitle"
      hintKey="terminal.pairingHint"
      codeLabelKey="terminal.pairingCodeLabel"
      code={terminalPairingUi.code}
      expiresText={terminalPairingUi.expiresAt
        ? tf('terminal.pairingExpires', {
            expiresAt: new Date(terminalPairingUi.expiresAt).toLocaleTimeString(),
          })
        : null}
      error={terminalPairingUi.error}
      loading={terminalOps.loading}
    />
  {/if}
</div>
