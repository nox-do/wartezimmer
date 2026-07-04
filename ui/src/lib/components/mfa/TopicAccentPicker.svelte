<script lang="ts">
  import { TOPIC_ACCENT_PRESETS, normalizeTopicAccentColor } from '$lib/topics/topic-accent';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    value: string;
    disabled?: boolean;
    onChange?: (accentColor: string) => void;
  }

  let { value, disabled = false, onChange }: Props = $props();

  const normalized = $derived(normalizeTopicAccentColor(value));
</script>

<div class="topic-accent-picker" role="group" aria-label={t('mfa.settings.topicAccentAria')}>
  <div class="topic-accent-picker__swatches">
    {#each TOPIC_ACCENT_PRESETS as color (color)}
      <button
        type="button"
        class="topic-accent-picker__swatch"
        class:topic-accent-picker__swatch--active={normalized === color}
        style="background:{color}"
        disabled={disabled}
        aria-label={color}
        aria-pressed={normalized === color}
        onclick={() => onChange?.(color)}
      ></button>
    {/each}
  </div>
  <label class="topic-accent-picker__custom">
    <span class="topic-accent-picker__custom-label">{t('mfa.settings.topicAccentCustom')}</span>
    <input
      type="color"
      value={normalized}
      disabled={disabled}
      oninput={(event) => onChange?.((event.currentTarget as HTMLInputElement).value)}
    />
  </label>
</div>
