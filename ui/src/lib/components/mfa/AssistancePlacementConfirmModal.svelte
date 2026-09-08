<script lang="ts">
  import { formatTicketCode } from '@praxis-flow/domain';
  import { Users } from '@lucide/svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import type { AssistancePlacementTicket } from '$lib/mfa/mfa-queue-actions.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    ticket?: AssistancePlacementTicket | null;
    busy?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }

  let { ticket = null, busy = false, onConfirm, onCancel }: Props = $props();

  const open = $derived(ticket != null);
  const ticketLabel = $derived(
    ticket ? formatTicketCode(ticket.laneCode, ticket.number) : '',
  );
</script>

<Modal
  {open}
  title={t('mfa.assistancePlacementTitle')}
  showCloseButton={false}
  closeOnEscape={!busy}
  closeOnBackdropClick={!busy}
  dimBackdrop={true}
  maxWidth="440px"
  onClose={onCancel}
>
  {#if ticket}
    <p>{tf('mfa.assistancePlacementDesc', { ticket: ticketLabel, room: ticket.roomLabel })}</p>
    <div class="alert alert--warn" role="status">
      <Users size={20} aria-hidden="true" />
      <strong>{t('mfa.assistancePlacementWarning')}</strong>
    </div>
    <div class="form-actions">
      <Button type="button" variant="outline" disabled={busy} onclick={onCancel}>
        {t('ui.cancel')}
      </Button>
      <Button type="button" variant="primary" disabled={busy} onclick={onConfirm}>
        {busy ? t('mfa.assistancePlacementSubmitting') : t('mfa.assistancePlacementConfirm')}
      </Button>
    </div>
  {/if}
</Modal>
