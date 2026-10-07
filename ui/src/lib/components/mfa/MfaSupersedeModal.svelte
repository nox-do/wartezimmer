<script lang="ts">
  import FormField from '$lib/components/forms/FormField.svelte';
  import { ArrowRightLeft } from '@lucide/svelte';
  import { formatTicketCode } from '@wartezimmer/domain';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
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
  const submitDisabled = $derived(submitBusy || !selectedTopic || topics.length === 0);

  $effect(() => {
    // Reset on open/close — do not auto-pick a topic; user must choose explicitly.
    void item?.visitId;
    topicId = '';
  });

  function handleClose() {
    if (submitBusy) {
      return;
    }
    onClose();
  }

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

  async function submit(event: Event, printReceipt = false) {
    event.preventDefault();
    if (!item || !topicId || submitBusy) {
      return;
    }
    submitBusy = true;
    const result = await supersedeVisitTopic(item.visitId, topicId);
    if (result.error) {
      submitBusy = false;
      toastStore.error(result.error.message);
      return;
    }
    if (printReceipt) {
      await printTicket({
        visitId: result.data.visitId,
        laneCode: result.data.laneCode,
        number: result.data.number,
        topicId: result.data.topicId,
        topicLabel: result.data.topicLabel,
        destinationRoomLabel: result.data.destinationRoomLabel,
      });
    }
    submitBusy = false;
    toastStore.success(
      tf(printReceipt ? 'mfa.supersedeCreatedWithReceipt' : 'mfa.supersedeCreated', {
        ticket: formatTicketCode(result.data.laneCode, result.data.number),
      }),
    );
    onClose();
  }
</script>

<Modal
  {open}
  dimBackdrop={true}
  maxWidth="560px"
  headerClass="modal-header--hero bg-gradient-primary"
  closeOnEscape={!submitBusy}
  onClose={handleClose}
>
  {#snippet header()}
    <div class="modal-header__left">
      <div class="modal-header__icon">
        <ArrowRightLeft size={18} aria-hidden="true" />
      </div>
      <div class="modal-header__texts">
        <h2 id="modal-title" class="modal-title">{t('mfa.supersedeTitle')}</h2>
      </div>
    </div>
  {/snippet}

  {#if item}
    <form class="modal-form" onsubmit={(event) => void submit(event, false)}>
      <p class="modal-subtitle">
        {tf('mfa.supersedeHint', {
          ticket: formatTicketCode(item.laneCode, item.number),
          topic: item.topicLabel ?? '',
        })}
      </p>

      {#if topics.length === 0}
        <p class="text-muted">{t('mfa.supersedeNoTopics')}</p>
      {:else}
        <FormField label={t('mfa.supersedeTopicLabel')}>
          {#snippet children(field)}
            <select {...field} class="form-select" bind:value={topicId} disabled={submitBusy} required>
              <option value="" disabled>{t('mfa.supersedeTopicPlaceholder')}</option>
              {#each topics as topic (topic.topicId)}
                <option value={topic.topicId}>{topic.label}</option>
              {/each}
            </select>
          {/snippet}
        </FormField>
      {/if}

      <div class="form-actions form-actions--split form-actions--nowrap">
        <Button type="button" variant="outline" disabled={submitBusy} onclick={handleClose}>
          {t('ui.cancel')}
        </Button>
        <div class="form-actions__end">
          <Button type="submit" variant="primary" loading={submitBusy} disabled={submitDisabled}>
            {submitBusy ? t('mfa.supersedeSubmitting') : t('mfa.supersedeConfirm')}
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={submitBusy}
            disabled={submitDisabled}
            onclick={(event) => void submit(event, true)}
          >
            {submitBusy ? t('mfa.supersedeSubmitting') : t('mfa.supersedeConfirmWithReceipt')}
          </Button>
        </div>
      </div>
    </form>
  {/if}
</Modal>
