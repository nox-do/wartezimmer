<script lang="ts">
  import { LogOut } from '@lucide/svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface TicketRef {
    visitId: string;
    laneCode: string;
    number: number;
  }

  interface Props {
    ticket?: TicketRef | null;
    busy?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }

  let { ticket = null, busy = false, onConfirm, onCancel }: Props = $props();

  const open = $derived(ticket != null);

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
        <LogOut size={18} aria-hidden="true" />
      </div>
      <div class="modal-header__texts">
        <h2 id="modal-title" class="modal-title">{t('mfa.checkOutModalTitle')}</h2>
        {#if ticket}
          <p class="modal-subtitle">
            {tf('mfa.checkOutModalDesc', {
              ticket: `${ticket.laneCode}-${String(ticket.number).padStart(3, '0')}`,
            })}
          </p>
        {/if}
      </div>
    </div>
  {/snippet}

  <div class="form-actions">
    <Button type="button" variant="outline" disabled={busy} onclick={handleClose}>
      {t('ui.cancel')}
    </Button>
    <Button type="button" variant="primary" loading={busy} disabled={busy} onclick={() => onConfirm?.()}>
      {busy ? t('mfa.checkOutModalSubmitting') : t('mfa.checkOutModalSubmit')}
    </Button>
  </div>
</Modal>
