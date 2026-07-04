<script lang="ts">
  import Button from '$lib/components/forms/Button.svelte';
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

  function handleClick() {
    if (toggleDisabled) {
      return;
    }
    onToggle?.(!checkinLocked);
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
