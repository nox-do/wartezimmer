<script lang="ts">
  import ChoiceField from '$lib/components/forms/ChoiceField.svelte';
  import FormField from '$lib/components/forms/FormField.svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import {
    fetchMessagingCatalog,
    fetchOpsSystemSettings,
    patchMessagingProvider,
    patchOpsSystemSettings,
    type MessagingProviderDescriptor,
  } from '$lib/ops/ops-system-api';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    disabled?: boolean;
    setupMode?: boolean;
    onReadyChange?: (ready: boolean) => void;
  }

  let { disabled = false, setupMode = false, onReadyChange }: Props = $props();

  let panelLoading = $state(true);
  let savingTarget = $state<'sms' | 'whatsapp' | null>(null);
  let sevenProvider = $state<MessagingProviderDescriptor | null>(null);
  let whatsappProvider = $state<MessagingProviderDescriptor | null>(null);

  let sharedApiKey = $state('');
  const hasStoredApiKey = $derived(Boolean(sevenProvider?.hasApiKey || whatsappProvider?.hasApiKey));
  let smsEnabled = $state(false);
  let smsFrom = $state('');
  let whatsappEnabled = $state(false);
  let whatsappFrom = $state('');
  let whatsappTemplate = $state('');
  let whatsappLanguage = $state('');

  function isSmsReady(): boolean {
    return Boolean(sevenProvider?.configured && sevenProvider.enabled);
  }

  function syncReady() {
    onReadyChange?.(isSmsReady());
  }

  function buildCredentials(includeApiKey: boolean): Record<string, string> {
    const credentials: Record<string, string> = {};
    if (includeApiKey && sharedApiKey.trim()) {
      credentials.apiKey = sharedApiKey.trim();
    }
    return credentials;
  }

  async function load() {
    const [settingsResult, catalogResult] = await Promise.all([
      fetchOpsSystemSettings(),
      fetchMessagingCatalog(),
    ]);
    panelLoading = false;

    if (!settingsResult.ok) {
      toastStore.error(settingsResult.error.message || t('ops.loadError'));
      return;
    }

    if (!catalogResult.ok) {
      toastStore.error(catalogResult.error.message || t('ops.loadError'));
      return;
    }

    sevenProvider =
      catalogResult.data.channels.flatMap((c) => c.providers).find((p) => p.id === 'seven') ?? null;
    whatsappProvider =
      catalogResult.data.channels.flatMap((c) => c.providers).find((p) => p.id === 'seven_whatsapp') ?? null;

    smsEnabled = sevenProvider?.enabled ?? false;
    whatsappEnabled = whatsappProvider?.enabled ?? false;
    smsFrom = sevenProvider?.settings.from ?? '';
    whatsappFrom = whatsappProvider?.settings.from ?? '';
    whatsappTemplate = whatsappProvider?.settings.template ?? '';
    whatsappLanguage = whatsappProvider?.settings.language ?? '';
    syncReady();
  }

  async function saveSms() {
    savingTarget = 'sms';
    try {
      const settingsResult = await fetchOpsSystemSettings();
      if (settingsResult.ok && settingsResult.data.smsProvider !== 'seven') {
        const providerPatch = await patchOpsSystemSettings({ smsProvider: 'seven' });
        if (!providerPatch.ok) {
          toastStore.error(providerPatch.error.message || t('ops.loadError'));
          return;
        }
      }
      const credentials = buildCredentials(true);
      if (smsFrom.trim()) {
        credentials.from = smsFrom.trim();
      }
      const result = await patchMessagingProvider('seven', {
        enabled: smsEnabled,
        credentials,
      });
      if (!result.ok) {
        toastStore.error(result.error.message || t('ops.loadError'));
        syncReady();
        return;
      }
      toastStore.success(t('ops.messagingSaveSmsOk'));
      sharedApiKey = '';
      smsFrom = '';
      await load();
    } finally {
      savingTarget = null;
    }
  }

  async function saveWhatsApp() {
    savingTarget = 'whatsapp';
    try {
      const credentials = buildCredentials(true);
      if (whatsappFrom.trim()) {
        credentials.from = whatsappFrom.trim();
      }
      if (whatsappTemplate.trim()) {
        credentials.template = whatsappTemplate.trim();
      }
      if (whatsappLanguage.trim()) {
        credentials.language = whatsappLanguage.trim();
      }
      const result = await patchMessagingProvider('seven_whatsapp', {
        enabled: whatsappEnabled,
        credentials,
      });
      if (!result.ok) {
        toastStore.error(result.error.message || t('ops.loadError'));
        syncReady();
        return;
      }
      toastStore.success(t('ops.messagingSaveWhatsappOk'));
      sharedApiKey = '';
      whatsappFrom = '';
      whatsappTemplate = '';
      whatsappLanguage = '';
      await load();
    } finally {
      savingTarget = null;
    }
  }

  onMount(() => {
    void load();
  });

  $effect(() => {
    if (!setupMode) {
      return;
    }
    smsEnabled;
    sevenProvider?.configured;
    sevenProvider?.enabled;
    syncReady();
  });
</script>

{#if panelLoading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else}
  <p class="text-desc">{setupMode ? t('ops.setup.messagingWizardHint') : t('ops.messagingSevenIntro')}</p>

  <section class="panel">
    <FormField layout="row" label={t('ops.messagingSevenApiKeyLabel')} id="seven-shared-api-key">
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="password"
          bind:value={sharedApiKey}
          placeholder={hasStoredApiKey ? t('ops.messagingApiKeyStored') : t('ops.messagingApiKeyPlaceholder')}
          disabled={disabled || savingTarget != null}
          autocomplete="off"
        />
      {/snippet}
    </FormField>
    <p class="text-desc text-desc--tight" aria-live="polite">
      {hasStoredApiKey
        ? sharedApiKey.trim() ? t('ops.messagingApiKeyReplace') : t('ops.messagingApiKeyStoredHint')
        : t('ops.messagingApiKeyMissing')}
    </p>
    <p class="text-desc text-desc--tight">{t('ops.messagingSevenApiKeyHint')}</p>
    <p class="text-desc text-desc--tight">{t('ops.messagingSevenApiKeyPermissionsHint')}</p>
  </section>

  <section class="panel">
    <article class="panel panel--inset panel--inset-zinc">
      <h3 class="panel__title">
        <span>{t('ops.messagingSmsSectionTitle')}</span>
        {#if sevenProvider}
          <span
            class="pill"
            class:pill--ok={sevenProvider.configured && sevenProvider.enabled}
            class:pill--bad={!sevenProvider.configured || !sevenProvider.enabled}
          >
            {sevenProvider.configured && sevenProvider.enabled
              ? t('ops.messagingConfigured')
              : t('ops.messagingNotConfigured')}
          </span>
        {/if}
      </h3>
      <p class="text-desc text-desc--tight">{t('ops.messagingSmsSectionHint')}</p>

      <ChoiceField label={t('ops.messagingSmsEnabledLabel')} variant="toggle">
        <input type="checkbox" bind:checked={smsEnabled} disabled={disabled || savingTarget != null} />
      </ChoiceField>

      <FormField layout="row" label={t('ops.messagingSmsFromLabel')} id="seven-sms-from">
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="text"
          bind:value={smsFrom}
          placeholder={t('ops.messagingOptionalPlaceholder')}
          disabled={disabled || savingTarget != null}
          autocomplete="off"
        />
      {/snippet}
    </FormField>

      <div class="staff-actions">
        <Button
          type="button"
          variant="primary"
          loading={savingTarget === 'sms'}
          disabled={disabled || savingTarget != null}
          onclick={() => void saveSms()}
        >
          {t('ops.messagingSaveSms')}
        </Button>
      </div>
    </article>
  </section>

    <section class="panel">
      <article class="panel panel--inset panel--inset-zinc">
        <h3 class="panel__title">
          <span>{t('ops.messagingWhatsappSectionTitle')}</span>
          {#if whatsappProvider}
            <span
              class="pill"
              class:pill--ok={whatsappProvider.configured && whatsappProvider.enabled}
              class:pill--bad={!whatsappProvider.configured || !whatsappProvider.enabled}
            >
              {whatsappProvider.configured && whatsappProvider.enabled
                ? t('ops.messagingConfigured')
                : t('ops.messagingNotConfigured')}
            </span>
          {/if}
        </h3>
        <p class="text-desc text-desc--tight">{t('ops.messagingWhatsappSectionHint')}</p>

        <ChoiceField label={t('ops.messagingEnabledLabel')} variant="toggle">
          <input type="checkbox" bind:checked={whatsappEnabled} disabled={disabled || savingTarget != null} />
        </ChoiceField>

        <FormField layout="row" label={t('ops.messagingWhatsappFromLabel')} id="seven-wa-from">
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="text"
          bind:value={whatsappFrom}
          disabled={disabled || savingTarget != null}
          autocomplete="off"
        />
      {/snippet}
    </FormField>
        <FormField layout="row" label={t('ops.messagingWhatsappTemplateLabel')} id="seven-wa-template">
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="text"
          bind:value={whatsappTemplate}
          disabled={disabled || savingTarget != null}
          autocomplete="off"
        />
      {/snippet}
    </FormField>
        <FormField layout="row" label={t('ops.messagingWhatsappLanguageLabel')} id="seven-wa-language">
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="text"
          bind:value={whatsappLanguage}
          placeholder="de"
          disabled={disabled || savingTarget != null}
          autocomplete="off"
        />
      {/snippet}
    </FormField>

        <div class="staff-actions">
          <Button
            type="button"
            variant="primary"
            loading={savingTarget === 'whatsapp'}
            disabled={disabled || savingTarget != null}
            onclick={() => void saveWhatsApp()}
          >
            {t('ops.messagingSaveWhatsapp')}
          </Button>
        </div>
      </article>
    </section>

  {#if setupMode && isSmsReady()}
    <p class="text-desc">{t('ops.setup.messagingReady')}</p>
  {:else if setupMode}
    <p class="text-desc">{t('ops.setup.messagingSkipNote')}</p>
  {/if}
{/if}
