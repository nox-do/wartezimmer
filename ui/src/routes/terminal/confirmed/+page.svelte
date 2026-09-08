<script lang="ts">
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import { onMount } from 'svelte';
  import TerminalWlanPromoBanner from '$lib/components/terminal/TerminalWlanPromoBanner.svelte';
  import BrowserTranslatedText from '$lib/components/shared/BrowserTranslatedText.svelte';
  import { formatTicketCode } from '@praxis-flow/domain';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { terminalOps } from '$lib/terminal/terminal-ops-runtime.svelte';
  import {
    getPracticeProfileFallback,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { requestTerminalReceiptPrint } from '$lib/terminal/terminal-receipt-print.svelte';
  import { shouldAutoPrintTicket } from '$lib/terminal/terminal-print-settings';
  import { readCheckinResult, resetTerminalFlow } from '$lib/terminal/terminal-session';
  import { resolveReceiptTopicLabel } from '$lib/terminal/terminal-receipt-topic-label';

  const AUTO_CLOSE_SEC = 10;

  let result = $state(readCheckinResult());
  let remainingSec = $state(AUTO_CLOSE_SEC);

  function formatReceiptTimestamp(): string {
    return new Date().toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function maybePrintReceipt(checkin: NonNullable<ReturnType<typeof readCheckinResult>>) {
    if (!shouldAutoPrintTicket(checkin.visitId)) {
      return;
    }
    const profile = getPracticeProfileFallback();
    requestTerminalReceiptPrint({
      practiceName: practiceDisplayLabel(profile, t('terminal.practiceFallback')),
      ticketCode: formatTicketCode(checkin.laneCode, checkin.number),
      topicLabel: resolveReceiptTopicLabel(checkin, t('terminal.receiptTopicEmpfang')),
      destinationRoomLabel: checkin.needsAssistance ? null : checkin.destinationRoomLabel,
      printedAtLabel: formatReceiptTimestamp(),
      kind: 'ticket',
      visitId: checkin.visitId,
      assistance: checkin.needsAssistance === true,
    });
  }

  function closeScreen() {
    resetTerminalFlow();
    void gotoResolved('/terminal');
  }

  onMount(() => {
    const checkin = readCheckinResult();
    if (!checkin) {
      void gotoResolved('/terminal');
      return;
    }
    result = checkin;

    requestAnimationFrame(() => {
      maybePrintReceipt(checkin);
    });

    const countdownTimer = setInterval(() => {
      remainingSec -= 1;
      if (remainingSec <= 0) {
        clearInterval(countdownTimer);
        closeScreen();
      }
    }, 1000);

    return () => {
      clearInterval(countdownTimer);
    };
  });

  const ticketCode = $derived(result ? formatTicketCode(result.laneCode, result.number) : '—');
  const topicLabel = $derived(result ? (result.topicLabel ?? result.topicId) : '—');
  const destinationRoomLabel = $derived(result?.destinationRoomLabel?.trim() || null);
  const assistance = $derived(result?.needsAssistance === true);
  const ticketAriaLabel = $derived(
    result
      ? assistance
        ? tf('terminal.assistanceConfirmedAria', { code: ticketCode })
        : destinationRoomLabel
        ? tf('terminal.confirmedSummaryAria', { code: ticketCode, room: destinationRoomLabel })
        : tf('terminal.confirmedTicketAria', { code: ticketCode })
      : '',
  );
  const wlanPromoEnabled = $derived(terminalOps.terminalWlanPromoEnabled);
</script>

{#if result}
  <div class="terminal-body terminal-body--flow">
    <span class="pill pill--caps pill--ok">{assistance ? t('terminal.assistanceConfirmedBadge') : t('terminal.confirmedBadge')}</span>
    <h1>{assistance ? t('terminal.assistanceConfirmedTitle') : t('terminal.confirmedTitle')}</h1>

    <div
      class="terminal-callout terminal-callout--ticket terminal-confirmed-summary"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={ticketAriaLabel}
    >
      <div class="terminal-confirmed-summary__ticket">
        <p class="terminal-callout-label">{t('terminal.confirmedTicketLabel')}</p>
        <p class="terminal-callout-ticket-num">{ticketCode}</p>
      </div>

      <div class="terminal-confirmed-summary__divider" aria-hidden="true"></div>
      <div class="terminal-confirmed-summary__room">
        {#if assistance}
          <p class="terminal-confirmed-room-name">{t('terminal.assistanceConfirmedWaitHere')}</p>
        {:else}
          <p class="terminal-callout-label">{t('terminal.confirmedRoomLabel')}</p>
          {#if destinationRoomLabel}
            <p class="terminal-confirmed-room-name">
              <BrowserTranslatedText text={destinationRoomLabel} />
            </p>
          {:else}
            <p class="terminal-confirmed-room-fallback">{t('terminal.confirmedLead')}</p>
          {/if}
        {/if}
      </div>
    </div>

    <p class="terminal-confirmed-topic">{t('terminal.confirmedTopicLabel')}: <strong><BrowserTranslatedText text={topicLabel} /></strong></p>
    <p class="terminal-confirmed-lead">{assistance ? t('terminal.assistanceConfirmedLead') : t('terminal.confirmedLead')}</p>

    {#if wlanPromoEnabled && !assistance}
      <TerminalWlanPromoBanner ticketCode={ticketCode} />
    {/if}

    <button type="button" class="terminal-btn-close" onclick={closeScreen}>
      {t('terminal.confirmedClose')}{#if remainingSec > 0}<span class="terminal-btn-close-count"> ({remainingSec})</span>{/if}
    </button>
  </div>
{/if}
