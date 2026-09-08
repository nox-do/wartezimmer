<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    open?: boolean;
    busy?: boolean;
    onClose?: () => void;
    onConfirm?: () => void;
  }

  let { open = $bindable(false), busy = false, onClose, onConfirm }: Props = $props();

  function close() {
    if (busy) return;
    open = false;
    onClose?.();
  }
</script>

<Modal
  bind:open
  title={t('terminal.assistanceConfirmTitle')}
  showCloseButton={false}
  closeOnEscape={!busy}
  closeOnBackdropClick={!busy}
  onClose={close}
  maxWidth="600px"
>
  <p class="terminal-assistance-confirm-text">{t('terminal.assistanceConfirmText')}</p>
  <p class="terminal-assistance-confirm-hint">{t('terminal.assistanceConfirmHint')}</p>
  <div class="terminal-assistance-confirm-actions">
    <Button variant="outline" disabled={busy} onclick={close}>
      {t('terminal.assistanceConfirmBack')}
    </Button>
    <Button loading={busy} onclick={() => onConfirm?.()}>
      {busy ? t('terminal.assistanceConfirmBusy') : t('terminal.assistanceConfirmSubmit')}
    </Button>
  </div>
</Modal>

<style>
  .terminal-assistance-confirm-text {
    margin: 0;
    font-size: var(--text-md);
    line-height: 1.5;
    font-weight: 600;
  }

  .terminal-assistance-confirm-hint {
    margin: 12px 0 0;
    color: var(--muted-foreground);
    line-height: 1.45;
  }

  .terminal-assistance-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 24px;
  }

  @media (max-width: 520px) {
    .terminal-assistance-confirm-actions {
      flex-direction: column-reverse;
    }
  }
</style>
