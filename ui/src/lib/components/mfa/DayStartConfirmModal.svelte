<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    open?: boolean;
    busy?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }

  let { open = false, busy = false, onConfirm, onCancel }: Props = $props();
</script>

<Modal
  {open}
  title={t('mfa.settings.dayStartConfirmTitle')}
  headerClass="modal-header--hero bg-gradient-primary"
  maxWidth="480px"
  dimBackdrop={true}
  closeOnEscape={!busy}
  onClose={() => onCancel?.()}
>
  <p class="modal-subtitle">{t('mfa.settings.dayStartConfirmLead')}</p>
  <ul class="modal-bullet-list">
    <li>{t('mfa.settings.dayStartConfirmItemQueue')}</li>
    <li>{t('mfa.settings.dayStartConfirmItemLock')}</li>
    <li>{t('mfa.settings.dayStartConfirmItemSandbox')}</li>
  </ul>

  <div class="form-actions">
    <Button type="button" variant="outline" disabled={busy} onclick={() => onCancel?.()}>{t('ui.cancel')}</Button>
    <Button type="button" variant="danger" loading={busy} disabled={busy} onclick={() => onConfirm?.()}>
      {t('mfa.settings.dayStartConfirmAction')}
    </Button>
  </div>
</Modal>
