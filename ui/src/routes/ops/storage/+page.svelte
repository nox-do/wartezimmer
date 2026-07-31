<script lang="ts">
  import { onMount } from 'svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import { fetchDeploymentStorage, fetchOpsSystemSettings, type DeploymentStorageSnapshot } from '$lib/ops/ops-system-api';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  let loading = $state(true);
  let storage = $state<DeploymentStorageSnapshot | null>(null);
  let exportBasePath = $state('');

  async function load() {
    const [storageResult, settingsResult] = await Promise.all([
      fetchDeploymentStorage(),
      fetchOpsSystemSettings(),
    ]);
    loading = false;

    if (!storageResult.ok) {
      toastStore.error(storageResult.error.message || t('ops.loadError'));
      return;
    }
    storage = storageResult.data;

    if (settingsResult.ok) {
      exportBasePath = settingsResult.data.exportBasePath;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<StaffSettingsShell title={t('ops.storageTitle')} lead={t('ops.storageLead')}>
  {#if loading}
    <p class="text-muted">{t('ui.loading')}</p>
  {:else if storage}
    <section class="panel">
      <h2 class="panel__title">{t('ops.storageExplainTitle')}</h2>
      <p class="text-desc">{t('ops.storageExplainBody')}</p>
    </section>

    <section class="panel">
      <h2 class="panel__title">{t('ops.storageImportsLabel')}</h2>
      <div class="ops-folder-block panel panel--inset">
        <code>{storage.imports.userFolderLabel}</code>
        <span
          class="pill"
          class:pill--ok={storage.imports.ready}
          class:pill--bad={!storage.imports.ready}
        >
          {storage.imports.ready ? t('ops.storageReady') : t('ops.storageNotReady')}
        </span>
        {#if storage.imports.hint}
          <p class="text-desc">{storage.imports.hint}</p>
        {/if}
        {#if storage.imports.csvFiles.length > 0}
          <p class="text-desc">
            {tf('ops.storageImportsCsvList', {
              files: storage.imports.csvFiles.map((f) => f.fileName).join(', '),
            })}
          </p>
        {/if}
        <p class="text-desc">{t('ops.storageImportsConfigureHint')}</p>
      </div>

      <h2 class="panel__title">{t('ops.storageExportsLabel')}</h2>
      <div class="ops-folder-block panel panel--inset">
        <code>{storage.exports.userFolderLabel}</code>
        <span
          class="pill"
          class:pill--ok={storage.exports.ready}
          class:pill--bad={!storage.exports.ready}
        >
          {storage.exports.ready ? t('ops.storageReady') : t('ops.storageNotReady')}
        </span>
        {#if storage.exports.hint}
          <p class="text-desc">{storage.exports.hint}</p>
        {/if}
      </div>

      <p class="text-desc">
        {t('ops.storageExportPathLabel')}: <code>{exportBasePath}</code>
      </p>
    </section>
  {/if}
</StaffSettingsShell>
