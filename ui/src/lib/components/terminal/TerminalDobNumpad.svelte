<script lang="ts">
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    disabled?: boolean;
    onDigit: (digit: string) => void;
    onClear: () => void;
    onBackspace: () => void;
  }

  let { disabled = false, onDigit, onClear, onBackspace }: Props = $props();
</script>

<div class="numpad" aria-label={t('terminal.numpadAria')}>
  <div class="numpad-grid">
    {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit (digit)}
      <button type="button" class="numpad-key" {disabled} onclick={() => onDigit(digit)}>{digit}</button>
    {/each}
    <button type="button" class="numpad-key numpad-key--clear" {disabled} onclick={onClear}>
      {t('terminal.numpadDelete')}
    </button>
    <button type="button" class="numpad-key" {disabled} onclick={() => onDigit('0')}>0</button>
    <button
      type="button"
      class="numpad-key numpad-key--back"
      {disabled}
      aria-label={t('terminal.numpadBackspaceAria')}
      onclick={onBackspace}
    >
      ←
    </button>
  </div>
</div>
