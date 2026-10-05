<script lang="ts">
  import ChoiceField from '$lib/components/forms/ChoiceField.svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import {
    fetchOpsRoutingCapabilities,
    fetchOpsSystemSettings,
    patchOpsSystemSettings,
  } from '$lib/ops/ops-system-api';
  import type { OpsSettingsResponse } from '$lib/ops/openapi-types';
  import { toastStore } from '$lib/stores/toastStore';

  type RoutingMode = OpsSettingsResponse['routingMode'];

  let loading = $state(true);
  let busy = $state(false);
  let loadError = $state<string | null>(null);
  let settings = $state<OpsSettingsResponse | null>(null);
  let openVisitCount = $state(0);
  let selectedMode = $state<RoutingMode | null>(null);

  const canSave = $derived(
    settings !== null &&
      selectedMode !== null &&
      selectedMode !== settings.routingMode &&
      !loading &&
      !busy,
  );

  function applySettings(next: OpsSettingsResponse) {
    settings = next;
    selectedMode = next.routingMode;
  }

  async function load() {
    loading = true;
    loadError = null;
    const [settingsResult, capabilitiesResult] = await Promise.all([
      fetchOpsSystemSettings(),
      fetchOpsRoutingCapabilities(),
    ]);
    loading = false;

    if (!settingsResult.ok || !capabilitiesResult.ok) {
      const message = !settingsResult.ok
        ? settingsResult.error?.message || t('ops.loadError')
        : capabilitiesResult.error?.message || t('ops.loadError');
      loadError = message;
      toastStore.error(message);
      return;
    }

    applySettings(settingsResult.data);
    selectedMode = capabilitiesResult.data.routingMode;
    openVisitCount = capabilitiesResult.data.openVisitCount;
  }

  async function save() {
    if (!settings || selectedMode === null || selectedMode === settings.routingMode) {
      return;
    }

    busy = true;
    const result = await patchOpsSystemSettings({ routingMode: selectedMode });
    busy = false;

    if (!result.ok) {
      const message = result.error.message || t('ops.routing.saveError');
      loadError = message;
      toastStore.error(message);
      return;
    }

    loadError = null;
    applySettings(result.data);
    toastStore.success(t('ops.routing.saveOk'));
  }

  onMount(() => {
    void load();
  });
</script>

{#if loading}
  <p class="text-muted">{t('ops.routing.loading')}</p>
{:else if !settings}
  <div class="ops-routing__error">
    <p>{loadError || t('ops.loadError')}</p>
    <Button type="button" variant="outline" size="sm" onclick={() => void load()}>
      {t('ui.retry')}
    </Button>
  </div>
{:else}
  <div class="ops-routing__stack">
    <div class="ops-routing__options" role="radiogroup" aria-label={t('ops.routing.title')}>
      <ChoiceField variant="custom" class="ops-routing__option">
        {#snippet label()}
          <span class="ops-routing__meta">
            <strong>{t('ops.routing.simpleTitle')}</strong>
            <span>{t('ops.routing.simpleBody')}</span>
          </span>
        {/snippet}
        <input
          type="radio"
          name="routingMode"
          value="simple"
          checked={selectedMode === 'simple'}
          disabled={loading || busy}
          onchange={() => {
            selectedMode = 'simple';
          }}
        />
      </ChoiceField>

      <ChoiceField variant="custom" class="ops-routing__option">
        {#snippet label()}
          <span class="ops-routing__meta">
            <strong>{t('ops.routing.complexTitle')}</strong>
            <span>{t('ops.routing.complexBody')}</span>
          </span>
        {/snippet}
        <input
          type="radio"
          name="routingMode"
          value="complex"
          checked={selectedMode === 'complex'}
          disabled={loading || busy}
          onchange={() => {
            selectedMode = 'complex';
          }}
        />
      </ChoiceField>
    </div>

    <p class="text-muted">{t('ops.routing.globalHint')}</p>
    <p class="text-muted">
      {openVisitCount > 0
        ? `${t('ops.routing.guardHint')} (${openVisitCount})`
        : t('ops.routing.guardHint')}
    </p>

    {#if loadError}
      <p class="ops-routing__error-inline">{loadError}</p>
    {/if}

    <Button
      type="button"
      variant="primary"
      loading={busy}
      disabled={!canSave}
      onclick={() => void save()}
    >
      {t('ops.routing.save')}
    </Button>
  </div>
{/if}

<style>
  .ops-routing__stack {
    display: grid;
    gap: 1rem;
  }

  .ops-routing__options {
    display: grid;
    gap: 0.75rem;
  }

  .ops-routing__meta {
    display: grid;
    gap: 0.25rem;
  }

  .ops-routing__error {
    display: grid;
    gap: 0.75rem;
    color: var(--destructive);
  }

  .ops-routing__error-inline {
    margin: 0;
    color: var(--destructive);
    font-size: 0.9rem;
  }
</style>
