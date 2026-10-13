<script lang="ts">
  import { formatTicketCode } from '@wartezimmer/domain';
  import { LogOut, Trash2 } from '@lucide/svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface TicketRef {
    visitId: string;
    laneCode: string;
    number: number;
    purpose?: 'checkout' | 'cancel';
  }

  interface Props {
    ticket?: TicketRef | null;
    busy?: boolean;
    documentCount?: number;
    onConfirm?: () => void;
    onCancel?: () => void;
  }

  let { ticket = null, busy = false, documentCount = 0, onConfirm, onCancel }: Props = $props();

  const open = $derived(ticket != null);
  const purpose = $derived(ticket?.purpose === 'cancel' ? 'cancel' : 'checkout');
  const ticketLabel = $derived(
    ticket != null ? formatTicketCode(ticket.laneCode, ticket.number) : '',
  );

  function handleClose() {
    onCancel?.();
  }
</script>

<Modal
  {open}
  dimBackdrop={true}
  maxWidth="400px"
  headerClass="modal-header--hero bg-gradient-primary"
  closeOnEscape={!busy}
  onClose={handleClose}
>
  {#snippet header()}
    <div class="modal-header__left">
      <div class="modal-header__icon">
        {#if purpose === 'cancel'}
          <Trash2 size={18} aria-hidden="true" />
        {:else}
          <LogOut size={18} aria-hidden="true" />
        {/if}
      </div>
      <div class="modal-header__texts">
        <h2 id="modal-title" class="modal-title">
          {purpose === 'cancel' ? t('mfa.cancelVisitModalTitle') : t('mfa.checkOutModalTitle')}
        </h2>
        {#if ticket}
          <p class="modal-subtitle">
            {purpose === 'cancel'
              ? tf('mfa.cancelVisitModalDesc', { ticket: ticketLabel })
              : tf('mfa.checkOutModalDesc', { ticket: ticketLabel })}
          </p>
        {/if}
      </div>
    </div>
  {/snippet}

  {#if purpose === 'checkout' && documentCount > 0}
    <div class="alert alert--warn" role="alert">
      <strong>{tf('mfa.checkOutDocumentsWarning', { count: documentCount })}</strong>
    </div>
  {/if}

  <div class="form-actions">
    <Button type="button" variant="outline" disabled={busy} onclick={handleClose}>
      {t('ui.cancel')}
    </Button>
    <Button type="button" variant="primary" loading={busy} disabled={busy} onclick={() => onConfirm?.()}>
      {#if purpose === 'cancel'}
        {busy ? t('mfa.cancelVisitModalSubmitting') : t('mfa.cancelVisitModalSubmit')}
      {:else}
        {busy ? t('mfa.checkOutModalSubmitting') : t('mfa.checkOutModalSubmit')}
      {/if}
    </Button>
  </div>
</Modal>
