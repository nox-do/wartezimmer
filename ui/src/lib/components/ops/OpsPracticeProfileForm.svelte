<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import FormField from '$lib/components/forms/FormField.svelte';
  import {
    fetchOpsSystemSettings,
    patchOpsSystemSettings,
    type PracticeProfile,
  } from '$lib/ops/ops-system-api';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    variant?: 'settings' | 'setup';
    disabled?: boolean;
    onLoadStateChange?: (loading: boolean) => void;
  }

  let { variant = 'settings', disabled = false, onLoadStateChange }: Props = $props();

  let loading = $state(true);
  let loadError = $state(false);
  let loadedOk = $state(false);
  let busy = $state(false);
  let profile = $state<PracticeProfile>({
    displayName: '',
    street: '',
    postalCode: '',
    city: '',
    phone: '',
    email: '',
    dataProtectionOfficer: '',
    website: '',
  });

  const fieldDisabled = $derived(disabled || busy || loading || !loadedOk);

  $effect(() => {
    onLoadStateChange?.(loading);
  });

  function assignProfile(next: PracticeProfile) {
    profile = { ...next };
  }

  export async function load(): Promise<boolean> {
    loading = true;
    loadError = false;
    loadedOk = false;
    const result = await fetchOpsSystemSettings();
    loading = false;
    if (!result.ok) {
      loadError = true;
      loadedOk = false;
      toastStore.error(result.error.message || t('ops.loadError'));
      return false;
    }
    assignProfile(result.data.practiceProfile);
    loadedOk = true;
    loadError = false;
    return true;
  }

  export function canContinue(): boolean {
    return !loading && loadedOk && profile.displayName.trim().length > 0;
  }

  export function hasLoadError(): boolean {
    return loadError;
  }

  export function isProfileLoaded(): boolean {
    return !loading && loadedOk;
  }

  export function isLoading(): boolean {
    return loading;
  }

  export async function save(): Promise<boolean> {
    if (loading || !loadedOk) {
      toastStore.error(t('ops.loadError'));
      return false;
    }
    if (!canContinue()) {
      toastStore.error(t('ops.practice.displayNameRequired'));
      return false;
    }

    busy = true;
    const result = await patchOpsSystemSettings({ practiceProfile: profile });
    busy = false;
    if (!result.ok) {
      toastStore.error(result.error.message || t('ops.practice.saveError'));
      return false;
    }
    assignProfile(result.data.practiceProfile);
    if (variant === 'settings') {
      toastStore.success(t('ops.practice.saveOk'));
    }
    return true;
  }

  onMount(() => {
    if (variant === 'settings') {
      void load();
    }
  });
</script>

{#if loading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else if loadError}
  <p class="ops-practice-form__error">{t('ops.loadError')}</p>
  <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onclick={() => void load()}>
    {t('ui.retry')}
  </Button>
{:else}
  <div class="modal-form">
    <FormField label={t('ops.practice.displayNameLabel')}>
      {#snippet children(field)}
        <input {...field} class="form-input" bind:value={profile.displayName} disabled={fieldDisabled} required />
      {/snippet}
    </FormField>

    <FormField label={t('ops.practice.streetLabel')}>
      {#snippet children(field)}
        <input {...field} class="form-input" bind:value={profile.street} disabled={fieldDisabled} />
      {/snippet}
    </FormField>

    <div class="ops-practice-form__row">
      <FormField label={t('ops.practice.postalCodeLabel')}>
        {#snippet children(field)}
          <input {...field} class="form-input" bind:value={profile.postalCode} disabled={fieldDisabled} />
        {/snippet}
      </FormField>
      <FormField label={t('ops.practice.cityLabel')}>
        {#snippet children(field)}
          <input {...field} class="form-input" bind:value={profile.city} disabled={fieldDisabled} />
        {/snippet}
      </FormField>
    </div>

    <FormField label={t('ops.practice.phoneLabel')}>
      {#snippet children(field)}
        <input {...field} class="form-input" bind:value={profile.phone} disabled={fieldDisabled} />
      {/snippet}
    </FormField>

    <FormField label={t('ops.practice.emailLabel')}>
      {#snippet children(field)}
        <input {...field} class="form-input" type="email" bind:value={profile.email} disabled={fieldDisabled} />
      {/snippet}
    </FormField>

    <FormField label={t('ops.practice.dpoLabel')}>
      {#snippet children(field)}
        <input {...field} class="form-input" bind:value={profile.dataProtectionOfficer} disabled={fieldDisabled} />
      {/snippet}
    </FormField>

    <FormField label={t('ops.practice.websiteLabel')}>
      {#snippet children(field)}
        <input {...field} class="form-input" bind:value={profile.website} disabled={fieldDisabled} />
      {/snippet}
    </FormField>

    {#if variant === 'settings'}
      <Button type="button" variant="primary" loading={busy} disabled={fieldDisabled} onclick={() => void save()}>
        {t('ops.practice.save')}
      </Button>
    {/if}
  </div>
{/if}

<style>
  .ops-practice-form__error {
    margin: 0 0 0.75rem;
    color: var(--destructive);
    font-size: 0.92rem;
  }

  .ops-practice-form__row {
    display: grid;
    grid-template-columns: 8rem 1fr;
    gap: 0.75rem;
  }
</style>
