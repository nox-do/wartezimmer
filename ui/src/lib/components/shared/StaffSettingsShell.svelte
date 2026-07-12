<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    title: string;
    lead?: string;
    variant?: 'hub' | 'section';
    surface: 'mfa' | 'ops';
    children?: Snippet;
  }

  let { title, lead = '', variant = 'section', surface, children }: Props = $props();
</script>

<div class="staff-settings" data-surface={surface}>
  <nav class="staff-settings__nav">
    {#if surface === 'mfa'}
      <a href={resolve('/mfa')}>{t('mfa.backToQueue')}</a>
      {#if variant === 'section'}
        <span aria-hidden="true">·</span>
        <a href={resolve('/mfa/settings')}>{t('mfa.settings.hubTitle')}</a>
      {/if}
    {:else}
      <a href={resolve('/')}>{t('nav.home')}</a>
      <span aria-hidden="true">·</span>
      <a href={resolve('/ops')}>{t('ops.hubTitle')}</a>
      {#if variant === 'section'}
        <span aria-hidden="true">·</span>
        <span>{title}</span>
      {/if}
    {/if}
  </nav>

  <header class="staff-settings__header">
    <h1>{title}</h1>
    {#if lead}
      <p class="staff-settings__lead">{lead}</p>
    {/if}
  </header>

  {@render children?.()}
</div>
