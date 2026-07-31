<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any -- resolve() overloads; backHref is dynamic */
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import type { TranslationKey } from '$lib/i18n/core/translation-keys';

  interface Props {
    title: string;
    lead?: string;
    /** Escape link when no sidebar layout (e.g. Ops setup). */
    backHref?: string;
    backLabelKey?: TranslationKey;
    /** Optional trailing actions beside the lead (e.g. Journey “Neue Journey”). */
    actions?: Snippet;
    /** Tighter header spacing for dense editors. */
    density?: 'default' | 'compact';
    children?: Snippet;
  }

  let {
    title,
    lead = '',
    backHref,
    backLabelKey,
    actions,
    density = 'default',
    children,
  }: Props = $props();
</script>

<div class="staff-settings" class:staff-settings--compact={density === 'compact'}>
  {#if backHref && backLabelKey}
    <nav class="staff-settings__nav">
      <a href={resolve(backHref as any)}>{t(backLabelKey)}</a>
    </nav>
  {/if}

  <header class="staff-settings__header">
    <h1>{title}</h1>
    {#if lead || actions}
      {#if actions}
        <div class="staff-settings__lead-row">
          {#if lead}
            <p class="staff-settings__lead">{lead}</p>
          {/if}
          <div class="staff-settings__actions">
            {@render actions()}
          </div>
        </div>
      {:else if lead}
        <p class="staff-settings__lead">{lead}</p>
      {/if}
    {/if}
  </header>

  {@render children?.()}
</div>
