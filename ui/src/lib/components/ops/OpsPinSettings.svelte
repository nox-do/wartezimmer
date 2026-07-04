<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { changeAuthPin } from '$lib/auth/session-client';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  let dialogOpen = $state(false);
  let busy = $state(false);
  let form = $state({ currentPin: '', newPin: '', confirmNewPin: '' });

  function openDialog() {
    if (busy) {
      return;
    }
    dialogOpen = true;
    form = { currentPin: '', newPin: '', confirmNewPin: '' };
  }

  function closeDialog() {
    if (busy) {
      return;
    }
    dialogOpen = false;
    form = { currentPin: '', newPin: '', confirmNewPin: '' };
  }

  async function submitDialog() {
    const currentPin = form.currentPin.trim();
    const newPin = form.newPin.trim();
    const confirmNewPin = form.confirmNewPin.trim();
    const pinPattern = /^\d{4,}$/;
    if (!pinPattern.test(currentPin) || !pinPattern.test(newPin) || !pinPattern.test(confirmNewPin)) {
      toastStore.error(t('ops.pinChangeInvalid'));
      return;
    }
    if (newPin !== confirmNewPin) {
      toastStore.error(t('ops.pinRepeatMismatch'));
      return;
    }

    busy = true;
    try {
      const result = await changeAuthPin({ target: 'ops', currentPin, newPin });
      if (!result.ok) {
        toastStore.error(
          result.error.status === 401
            ? t('ops.pinChangeCurrentInvalid')
            : result.error.message || t('ops.loadError'),
        );
        return;
      }
      closeDialog();
      toastStore.success(t('ops.pinChangeSaved'));
    } finally {
      busy = false;
    }
  }
</script>

<section class="panel">
  <p class="text-desc">{t('ops.pinSecurityDesc')}</p>
  <Button type="button" variant="outline" loading={busy} disabled={busy} onclick={openDialog}>
    {t('ops.pinChangeSubmit')}
  </Button>
</section>

<Modal
  open={dialogOpen}
  title={t('ops.pinChangeSubmit')}
  headerClass="modal-header--hero bg-gradient-primary"
  maxWidth="520px"
  dimBackdrop={true}
  closeOnEscape={!busy}
  showCloseButton={!busy}
  onClose={closeDialog}
>
  <form
    class="modal-form"
    onsubmit={(event) => {
      event.preventDefault();
      void submitDialog();
    }}
  >
    <label class="modal-form-field">
      <span>{t('ops.pinCurrentLabel')}</span>
      <input
        class="form-input"
        type="password"
        inputmode="numeric"
        autocomplete="current-password"
        bind:value={form.currentPin}
        required
        minlength="4"
        pattern={'[0-9]{4,}'}
        disabled={busy}
      />
    </label>

    <label class="modal-form-field">
      <span>{t('ops.pinNewLabel')}</span>
      <input
        class="form-input"
        type="password"
        inputmode="numeric"
        autocomplete="new-password"
        bind:value={form.newPin}
        required
        minlength="4"
        pattern={'[0-9]{4,}'}
        disabled={busy}
      />
    </label>

    <label class="modal-form-field">
      <span>{t('ops.pinRepeatLabel')}</span>
      <input
        class="form-input"
        type="password"
        inputmode="numeric"
        autocomplete="new-password"
        bind:value={form.confirmNewPin}
        required
        minlength="4"
        pattern={'[0-9]{4,}'}
        disabled={busy}
      />
    </label>

    <div class="form-actions">
      <Button type="button" variant="outline" disabled={busy} onclick={closeDialog}>
        {t('ui.cancel')}
      </Button>
      <Button type="submit" variant="primary" loading={busy} disabled={busy}>
        {t('ops.pinChangeSubmit')}
      </Button>
    </div>
  </form>
</Modal>

<style>
  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
</style>
