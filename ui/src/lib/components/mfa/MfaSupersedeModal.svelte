<script lang="ts">
  import { formatTicketCode } from '@praxis-flow/domain';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';
  import { mfaPracticeContext } from '$lib/mfa/mfa-practice-context.svelte';
  import { supersedeVisitTopic } from '$lib/queue/queue-actions';
  import { resolveReceiptTopicLabel } from '$lib/terminal/terminal-receipt-topic-label';
  import { requestTerminalReceiptPrint } from '$lib/terminal/terminal-receipt-print.svelte';
  import {
    loadPracticeProfile,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import type { QueueItem } from '$lib/queue/types';

  interface Props {
    item: QueueItem | null;
    onClose: () => void;
  }

  let { item, onClose }: Props = $props();

  let topicId = $state('');
  let submitBusy = $state(false);

  const open = $derived(item != null);
  const topics = $derived(
    mfaPracticeContext.practiceTopics.filter(
      (topic) => topic.enabled && topic.topicId !== item?.topicId,
    ),
  );
  const selectedTopic = $derived(topics.find((topic) => topic.topicId === topicId) ?? null);

  $effect(() => {
    if (!item) {
      topicId = '';
      return;
    }
    if (!topicId && topics.length > 0) {
      topicId = topics[0]!.topicId;
    }
  });

  function formatReceiptTimestamp(): string {
    return new Date().toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function printTicket(result: {
    visitId: string;
    laneCode: string;
    number: number;
    topicId: string;
    topicLabel: string;
    destinationRoomLabel?: string | null;
  }) {
    const profile = await loadPracticeProfile();
    requestTerminalReceiptPrint({
      practiceName: practiceDisplayLabel(profile, t('terminal.practiceFallback')),
      ticketCode: formatTicketCode(result.laneCode, result.number),
      topicLabel: resolveReceiptTopicLabel(
        {
          authPath: 'none',
          topicId: result.topicId,
          topicLabel: result.topicLabel,
        },
        t('terminal.receiptTopicEmpfang'),
      ),
      destinationRoomLabel: result.destinationRoomLabel ?? null,
      printedAtLabel: formatReceiptTimestamp(),
      kind: 'ticket',
      visitId: result.visitId,
    });
  }

  async function submit(event: Event) {
    event.preventDefault();
    if (!item || !topicId || submitBusy) {
      return;
    }
    submitBusy = true;
    const result = await supersedeVisitTopic(item.visitId, topicId);
    submitBusy = false;
    if (result.error) {
      toastStore.error(result.error.message);
      return;
    }
    await printTicket({
      visitId: result.data.visitId,
      laneCode: result.data.laneCode,
      number: result.data.number,
      topicId: result.data.topicId,
      topicLabel: result.data.topicLabel,
      destinationRoomLabel: result.data.destinationRoomLabel,
    });
    toastStore.success(
      tf('mfa.supersedeCreatedWithReceipt', {
        ticket: formatTicketCode(result.data.laneCode, result.data.number),
      }),
    );
    onClose();
  }
</script>

{#if open && item}
  <div class="modal-backdrop" role="presentation" onclick={onClose}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-supersede-title"
      onclick={(event) => event.stopPropagation()}
    >
      <h2 id="mfa-supersede-title">{t('mfa.supersedeTitle')}</h2>
      <p class="hint">
        {tf('mfa.supersedeHint', {
          ticket: formatTicketCode(item.laneCode, item.number),
          topic: item.topicLabel ?? '',
        })}
      </p>
      <form onsubmit={submit}>
        <label class="form-label" for="mfa-supersede-topic">{t('mfa.supersedeTopicLabel')}</label>
        <select
          id="mfa-supersede-topic"
          class="form-select"
          bind:value={topicId}
          disabled={submitBusy || topics.length === 0}
        >
          {#each topics as topic (topic.topicId)}
            <option value={topic.topicId}>{topic.label}</option>
          {/each}
        </select>
        <div class="actions-row actions-row--footer">
          <button type="button" class="btn btn-ghost" disabled={submitBusy} onclick={onClose}>
            {t('ui.cancel')}
          </button>
          <button type="submit" class="btn btn-primary" disabled={submitBusy || !selectedTopic}>
            {t('mfa.supersedeConfirm')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
