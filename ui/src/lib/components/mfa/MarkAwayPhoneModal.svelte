<script lang="ts">
  import { formatTicketCode } from '@praxis-flow/domain';
  import { Pause } from '@lucide/svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { mfaPracticeContext } from '$lib/mfa/mfa-practice-context.svelte';
  import { compactPhoneForApi, formatStoredPhoneForDisplay } from '$lib/phone/format-phone-display';

  interface TicketRef {
    visitId: string;
    laneCode: string;
    number: number;
    initialPhone?: string;
  }

  interface Props {
    ticket?: TicketRef | null;
    purpose?: 'markAway' | 'fixRecallNotify';
    busy?: boolean;
    onConfirm?: (phoneNumber: string) => void;
    onCancel?: () => void;
  }

  let { ticket = null, purpose = 'markAway', busy = false, onConfirm, onCancel }: Props = $props();

  const ticketLabel = $derived(
    ticket != null ? formatTicketCode(ticket.laneCode, ticket.number) : '',
  );

  let open = $derived(ticket != null);
  let phoneNumber = $state('');

  function handleClose() {
    onCancel?.();
  }

  $effect(() => {
    if (ticket) {
      phoneNumber = formatStoredPhoneForDisplay(ticket.initialPhone?.trim() ?? '');
    }
  });

  function submit(event: Event) {
    event.preventDefault();
    onConfirm?.(compactPhoneForApi(phoneNumber));
  }
</script>

<Modal
  {open}
  dimBackdrop={true}
  maxWidth="420px"
  headerClass="modal-header--hero bg-gradient-primary"
  closeOnEscape={!busy}
  onClose={handleClose}
>
  {#snippet header()}
    <div class="modal-header__left">
      <div class="modal-header__icon">
        <Pause size={18} aria-hidden="true" />
      </div>
      <div class="modal-header__texts">
        <h2 id="modal-title" class="modal-title">
          {purpose === 'fixRecallNotify'
            ? t('mfa.fixRecallNotifyModalTitle')
            : t('mfa.markAwayModalTitle')}
        </h2>
      </div>
    </div>
  {/snippet}

  {#if ticket}
    <form class="modal-form" onsubmit={submit}>
      <p class="modal-subtitle">
        {#if purpose === 'fixRecallNotify'}
          {tf('mfa.fixRecallNotifyModalDesc', { ticket: ticketLabel })}
        {:else}
          {tf('mfa.markAwayModalDesc', {
            ticket: ticketLabel,
            minutes: mfaPracticeContext.returnWindowMinutes,
          })}
        {/if}
      </p>

      <label class="modal-form-field">
        <span>{t('mfa.markAwayPhoneLabel')}</span>
        <input
          class="form-input"
          type="tel"
          inputmode="tel"
          autocomplete="off"
          placeholder={t('mfa.markAwayPhonePlaceholder')}
          bind:value={phoneNumber}
          disabled={busy}
        />
      </label>

      <div class="form-actions">
        <Button type="button" variant="outline" disabled={busy} onclick={handleClose}>{t('ui.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy} loading={busy}>
          {busy
            ? purpose === 'fixRecallNotify'
              ? t('mfa.fixRecallNotifySubmitting')
              : t('mfa.markAwaySubmitting')
            : purpose === 'fixRecallNotify'
              ? t('mfa.fixRecallNotifySubmit')
              : t('mfa.markAwaySubmit')}
        </Button>
      </div>
    </form>
  {/if}
</Modal>
