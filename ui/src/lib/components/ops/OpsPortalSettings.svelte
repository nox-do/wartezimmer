<script lang="ts">
  import ChoiceGroup from '$lib/components/forms/ChoiceGroup.svelte';
  import ChoiceField from '$lib/components/forms/ChoiceField.svelte';
  import SettingsHeader from '$lib/components/shared/SettingsHeader.svelte';
  import { onMount } from 'svelte';
  import { fetchOpsOnboarding, patchOpsOnboarding } from '$lib/ops/ops-system-api';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  let {
    disabled = false,
    portalEnabled = $bindable(false),
    showSaveToast = true,
    loadOnMount = true,
  }: {
    disabled?: boolean;
    portalEnabled?: boolean;
    showSaveToast?: boolean;
    loadOnMount?: boolean;
  } = $props();

  let loading = $state(false);
  let saving = $state(false);

  async function load() {
    loading = true;
    const result = await fetchOpsOnboarding();
    loading = false;
    if (!result.ok) {
      toastStore.error(result.error.message || t('ops.loadError'));
      return;
    }
    portalEnabled = result.data.portalEnabled;
  }

  async function setPortalEnabled(enabled: boolean) {
    if (enabled === portalEnabled || disabled || saving) {
      return;
    }
    const previous = portalEnabled;
    saving = true;
    portalEnabled = enabled;
    try {
      const result = await patchOpsOnboarding({ portalEnabled: enabled });
      if (!result.ok) {
        portalEnabled = previous;
        toastStore.error(result.error.message || t('ops.loadError'));
        return;
      }
      portalEnabled = result.data.portalEnabled;
      if (showSaveToast) {
        toastStore.success(t('ops.portalSaveOk'));
      }
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    if (loadOnMount) {
      void load();
    } else {
      loading = false;
    }
  });
</script>

{#if loading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else}
  <ChoiceGroup label={t('ops.setup.portalTitle')} disabled={disabled || saving} busy={saving}>
    <ChoiceField label={t('ops.setup.portalOff')} variant="radio">
      <input
        type="radio"
        name="portal-enabled-settings"
        value="off"
        checked={!portalEnabled}
        onchange={() => void setPortalEnabled(false)}
      />
    </ChoiceField>
    <ChoiceField label={t('ops.setup.portalOn')} variant="radio">
      <input
        type="radio"
        name="portal-enabled-settings"
        value="on"
        checked={portalEnabled}
        onchange={() => void setPortalEnabled(true)}
      />
    </ChoiceField>
  </ChoiceGroup>
  {#if portalEnabled}
    <p class="text-desc">{t('ops.setup.portalOnHint')}</p>
    <div class="ops-setup-host-hint">
      <SettingsHeader layout="plain" level={3} title={t('ops.setup.portalHostTitle')} description={t('ops.setup.portalHostBody')} />
    </div>
  {:else}
    <p class="text-desc">{t('ops.setup.portalOffNote')}</p>
  {/if}
{/if}
