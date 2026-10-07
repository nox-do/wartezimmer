<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getPracticeProfileFallback,
    mountPracticeProfileSync,
  } from '$lib/practice/practice-profile-client';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import ProductMark from '$lib/components/shared/ProductMark.svelte';

  type Props = {
    titleKey: string;
    hintKey: string;
    codeLabelKey: string;
    code?: string | null;
    expiresText?: string | null;
    error?: string | null;
    loading?: boolean;
  };

  let { titleKey, hintKey, codeLabelKey, code = null, expiresText = null, error = null, loading = false }: Props =
    $props();

  let practiceProfile = $state(getPracticeProfileFallback());
  const practiceName = $derived(practiceProfile.displayName.trim() || null);

  onMount(() => mountPracticeProfileSync((profile) => {
    practiceProfile = profile;
  }));
</script>

<div class="device-pairing-screen">
  {#if practiceName}
    <p class="device-pairing-praxis">{practiceName}</p>
  {/if}

  <section class="device-pairing" aria-live="polite">
    <p class="auth-kicker device-pairing-kicker"><ProductMark />{t('auth.kicker')}</p>
    <h1>{t(titleKey)}</h1>

    {#if loading}
      <p class="device-pairing-loading">{t('ui.loading')}</p>
    {:else if code}
      <p class="device-pairing-code" aria-label={t(codeLabelKey)}>{code}</p>
      <p class="device-pairing-hint">{t(hintKey)}</p>
      {#if expiresText}
        <p class="device-pairing-expiry">{expiresText}</p>
      {/if}
    {:else if error}
      <p class="device-pairing-error">{error}</p>
    {/if}
  </section>
</div>
