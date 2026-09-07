<script lang="ts">
  import Button from '$lib/components/forms/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    checkinLocked: boolean;
    busy?: boolean;
    compact?: boolean;
    /** Hide status line (e.g. when Quicksettings shows a status pill). */
    hideStatus?: boolean;
    /** e.g. new calendar day not started yet — terminal stays locked until day reset. */
    toggleDisabled?: boolean;
    onToggle?: (nextLocked: boolean) => void;
  }

  let {
    checkinLocked,
    busy = false,
    compact = false,
    hideStatus = false,
    toggleDisabled = false,
    onToggle,
  }: Props = $props();

  let confirmLockOpen = $state(false);

  function handleClick() {
    if (toggleDisabled) {
      return;
    }
    if (!checkinLocked) {
      confirmLockOpen = true;
      return;
    }
    onToggle?.(false);
  }

  function confirmLock() {
    confirmLockOpen = false;
    onToggle?.(true);
  }
</script>

<div class="terminal-lock" class:terminal-lock--compact={compact}>
  {#if !hideStatus}
    <p
      class="terminal-lock-status"
      class:terminal-lock-status--on={!checkinLocked}
      class:terminal-lock-status--off={checkinLocked}
    >
      {checkinLocked ? t('mfa.statusDisabled') : t('mfa.statusActive')}
    </p>
  {/if}
  <Button
    variant={checkinLocked ? 'primary' : 'danger'}
    size="sm"
    fullWidth={!compact}
    disabled={busy || toggleDisabled}
    loading={busy}
    onclick={handleClick}
  >
    {checkinLocked ? t('mfa.settings.terminalEnable') : t('mfa.settings.terminalDisable')}
  </Button>
</div>

<Modal
  bind:open={confirmLockOpen}
  title={t('mfa.settings.terminalDisableConfirmTitle')}
  maxWidth="440px"
  dimBackdrop={true}
  closeOnEscape={!busy}
  onClose={() => {
    confirmLockOpen = false;
  }}
>
  <div class="form-actions">
    <Button type="button" variant="outline" disabled={busy} onclick={() => (confirmLockOpen = false)}>
      {t('ui.cancel')}
    </Button>
    <Button type="button" variant="danger" disabled={busy} onclick={confirmLock}>
      {t('ui.yes')}
    </Button>
  </div>
</Modal>
