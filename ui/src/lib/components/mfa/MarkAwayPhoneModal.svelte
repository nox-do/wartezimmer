<script lang="ts">
  import FormField from '$lib/components/forms/FormField.svelte';
  import { formatTicketCode } from '@wartezimmer/domain';
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
    onConfirm?: (phoneNumber: string, consentConfirmed: boolean) => void;
    onCancel?: () => void;
  }

  let { ticket = null, purpose = 'markAway', busy = false, onConfirm, onCancel }: Props = $props();

  const ticketLabel = $derived(
    ticket != null ? formatTicketCode(ticket.laneCode, ticket.number) : '',
  );

  let open = $derived(ticket != null);
  let phoneNumber = $state('');
  let consentConfirmed = $state(false);
  const needsConsent = $derived(phoneNumber.trim().length > 0 || purpose === 'fixRecallNotify');

  function handleClose() {
    onCancel?.();
  }

  $effect(() => {
    consentConfirmed = false;
    if (ticket) {
      phoneNumber = formatStoredPhoneForDisplay(ticket.initialPhone?.trim() ?? '');
    }
  });

  function submit(event: Event) {
    event.preventDefault();
    if (busy || (needsConsent && !consentConfirmed) || (purpose === 'fixRecallNotify' && !phoneNumber.trim())) return;
    onConfirm?.(compactPhoneForApi(phoneNumber), consentConfirmed);
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

      <FormField label={t('mfa.markAwayPhoneLabel')}>
        {#snippet children(field)}
          <input
            {...field}
            class="form-input"
            type="tel"
            inputmode="tel"
            autocomplete="off"
            placeholder={t('mfa.markAwayPhonePlaceholder')}
            bind:value={phoneNumber}
            disabled={busy}
          />
        {/snippet}
      </FormField>

      {#if needsConsent}
        <label class="recall-consent">
          <input type="checkbox" bind:checked={consentConfirmed} disabled={busy} required />
          <span>{t('mfa.recallConsentLabel')}</span>
        </label>
        <p class="modal-form-hint">{t('mfa.recallConsentHint')}</p>
      {/if}

      <div class="form-actions">
        <Button type="button" variant="outline" disabled={busy} onclick={handleClose}>{t('ui.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy || (needsConsent && !consentConfirmed) || (purpose === 'fixRecallNotify' && !phoneNumber.trim())} loading={busy}>
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

<style>
  .recall-consent {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .recall-consent input {
    flex-shrink: 0;
    margin-top: 0.25rem;
  }
</style>
