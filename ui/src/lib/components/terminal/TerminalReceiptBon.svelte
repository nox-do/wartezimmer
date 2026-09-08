<script lang="ts">
  import type { TerminalReceiptPrintPayload } from '$lib/terminal/terminal-receipt-print.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    payload: TerminalReceiptPrintPayload;
  }

  let { payload }: Props = $props();
</script>

<article class="terminal-receipt-bon">
  <p class="terminal-receipt-bon__practice">{payload.practiceName}</p>
  <p class="terminal-receipt-bon__rule" aria-hidden="true">──────────────</p>
  <p class="terminal-receipt-bon__ticket">{payload.ticketCode}</p>
  <p class="terminal-receipt-bon__rule" aria-hidden="true">──────────────</p>
  <p class="terminal-receipt-bon__topic">{payload.topicLabel}</p>
  {#if payload.assistance}
    <p class="terminal-receipt-bon__room-label">{t('terminal.assistanceReceiptInstruction')}</p>
  {:else if payload.destinationRoomLabel?.trim()}
    <p class="terminal-receipt-bon__room-label">{t('terminal.confirmedRoomLabel')}</p>
    <p class="terminal-receipt-bon__room">{payload.destinationRoomLabel.trim()}</p>
  {/if}
  <p class="terminal-receipt-bon__time">{payload.printedAtLabel}</p>
  {#if payload.kind === 'test'}
    <p class="terminal-receipt-bon__test">{t('terminal.printSettingsTestMark')}</p>
  {/if}
  {#if !payload.assistance && !payload.destinationRoomLabel?.trim()}
    <p class="terminal-receipt-bon__footer">{t('terminal.receiptFooter')}</p>
  {/if}
</article>
