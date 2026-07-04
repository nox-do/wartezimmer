<script lang="ts">
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
    if (enabled === portalEnabled || disabled) {
      return;
    }
    portalEnabled = enabled;
    const result = await patchOpsOnboarding({ portalEnabled: enabled });
    if (!result.ok) {
      portalEnabled = !enabled;
      toastStore.error(result.error.message || t('ops.loadError'));
      return;
    }
    portalEnabled = result.data.portalEnabled;
    if (showSaveToast) {
      toastStore.success(t('ops.portalSaveOk'));
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
  <fieldset class="ops-setup-fieldset" disabled={disabled}>
    <legend class="sr-only">{t('ops.setup.portalTitle')}</legend>
    <label class="ops-setup-radio">
      <input
        type="radio"
        name="portal-enabled-settings"
        value="off"
        checked={!portalEnabled}
        onchange={() => void setPortalEnabled(false)}
      />
      {t('ops.setup.portalOff')}
    </label>
    <label class="ops-setup-radio">
      <input
        type="radio"
        name="portal-enabled-settings"
        value="on"
        checked={portalEnabled}
        onchange={() => void setPortalEnabled(true)}
      />
      {t('ops.setup.portalOn')}
    </label>
  </fieldset>
  {#if portalEnabled}
    <p class="text-desc">{t('ops.setup.portalOnHint')}</p>
    <div class="ops-setup-host-hint">
      <h3 class="panel__title">{t('ops.setup.portalHostTitle')}</h3>
      <p class="text-desc">{t('ops.setup.portalHostBody')}</p>
    </div>
  {:else}
    <p class="text-desc">{t('ops.setup.portalOffNote')}</p>
  {/if}
{/if}
