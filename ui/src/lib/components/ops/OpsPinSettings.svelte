<script lang="ts">
  import { tick } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import FormField from '$lib/components/forms/FormField.svelte';
  import { changeAuthPin } from '$lib/auth/session-client';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  let dialogOpen = $state(false);
  let busy = $state(false);
  let form = $state({ currentPin: '', newPin: '', confirmNewPin: '' });
  let currentPinInput: HTMLInputElement | null = $state(null);

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
    let retryCurrentPin = false;
    try {
      const result = await changeAuthPin({ target: 'ops', currentPin, newPin, role: 'ops' });
      if (!result.ok) {
        const currentPinWrong =
          result.error.status === 400 && !result.error.message?.includes('must be different');
        toastStore.error(
          result.error.status === 400
            ? currentPinWrong
              ? t('ops.pinChangeCurrentInvalid')
              : result.error.message
            : result.error.message || t('ops.loadError'),
        );
        if (currentPinWrong) {
          form = { ...form, currentPin: '' };
          retryCurrentPin = true;
        }
        return;
      }
      closeDialog();
      toastStore.success(t('ops.pinChangeSaved'));
    } finally {
      busy = false;
    }
    if (retryCurrentPin) {
      await tick();
      currentPinInput?.focus();
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
    class="modal-form modal-form--compact"
    onsubmit={(event) => {
      event.preventDefault();
      void submitDialog();
    }}
  >
    <FormField label={t('ops.pinCurrentLabel')}>
      {#snippet children(field)}
        <input
          {...field}
          bind:this={currentPinInput}
          class="form-input"
          type="password"
          inputmode="numeric"
          autocomplete="current-password"
          spellcheck="false"
          autocapitalize="off"
          bind:value={form.currentPin}
          onfocus={(event) => event.currentTarget.select()}
          required
          minlength="4"
          pattern={'[0-9]{4,}'}
          disabled={busy}
        />
      {/snippet}
    </FormField>

    <FormField label={t('ops.pinNewLabel')}>
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="password"
          inputmode="numeric"
          autocomplete="new-password"
          bind:value={form.newPin}
          onfocus={(event) => event.currentTarget.select()}
          required
          minlength="4"
          pattern={'[0-9]{4,}'}
          disabled={busy}
        />
      {/snippet}
    </FormField>

    <FormField label={t('ops.pinRepeatLabel')}>
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="password"
          inputmode="numeric"
          autocomplete="new-password"
          bind:value={form.confirmNewPin}
          onfocus={(event) => event.currentTarget.select()}
          required
          minlength="4"
          pattern={'[0-9]{4,}'}
          disabled={busy}
        />
      {/snippet}
    </FormField>

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
