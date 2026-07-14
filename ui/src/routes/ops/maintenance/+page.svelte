<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import {
    executeRuntimeReset,
    fetchRuntimeResetPreview,
    type RuntimeResetPreview,
  } from '$lib/ops/ops-system-api';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  let loading = $state(true);
  let busy = $state(false);
  let preview = $state<RuntimeResetPreview | null>(null);
  let confirmPhrase = $state('');

  const phraseMatches = $derived(
    preview != null && confirmPhrase.trim() === preview.confirmPhrase,
  );

  async function load() {
    const result = await fetchRuntimeResetPreview();
    loading = false;
    if (!result.ok) {
      toastStore.error(result.error.message || t('ops.loadError'));
      return;
    }
    preview = result.data;
  }

  async function handleReset() {
    if (!preview || !phraseMatches) {
      return;
    }
    busy = true;
    const result = await executeRuntimeReset(confirmPhrase.trim());
    busy = false;
    if (!result.ok) {
      toastStore.error(result.error.message);
      return;
    }

    toastStore.success(
      tf('ops.maintenanceResetOk', {
        tickets: String(result.data.resetVisitCount),
        outbox: String(result.data.clearedOutboxCount),
      }),
    );
    confirmPhrase = '';
    void load();
  }

  onMount(() => {
    void load();
  });
</script>

<StaffSettingsShell surface="ops" title={t('ops.maintenanceTitle')} lead={t('ops.maintenanceLead')}>
  {#if loading}
    <p class="text-muted">{t('ui.loading')}</p>
  {:else if !preview}
    <p class="text-desc">{t('ops.loadError')}</p>
  {:else if preview}
    <section class="panel">
      <h2 class="panel__title">{t('ops.maintenanceMfaHintTitle')}</h2>
      <p class="text-desc">{t('ops.maintenanceMfaHint')}</p>
    </section>

    <section class="panel">
      <p class="text-desc">{t('ops.maintenanceStaffPinHint')}</p>
    </section>

    <section class="panel">
      <h2 class="panel__title">{t('ops.maintenanceWillDeleteTitle')}</h2>
      <ul class="ops-maintenance-list">
        <li>
          {tf('ops.maintenanceTickets', { count: String(preview.visitCount) })}
        </li>
        <li>
          {tf('ops.maintenanceOutbox', { count: String(preview.outboxEventCount) })}
        </li>
        {#if preview.emergencyActive}
          <li>{t('ops.maintenanceEmergency')}</li>
        {/if}
      </ul>
    </section>

    <section class="panel">
      <h2 class="panel__title">{t('ops.maintenanceWillKeepTitle')}</h2>
      <ul class="ops-maintenance-list">
        <li>
          {tf('ops.maintenanceTopicsRooms', {
            topics: String(preview.preservedTopicCount),
            rooms: String(preview.preservedRoomCount),
          })}
        </li>
        <li>{t('ops.maintenanceSettingsKeep')}</li>
      </ul>
      <p class="text-desc">{t('ops.maintenanceAfterReset')}</p>
    </section>

    <section class="panel panel--danger">
      <h2 class="panel__title">{t('ops.maintenanceConfirmTitle')}</h2>
      <p class="text-desc">
        {tf('ops.maintenanceConfirmHint', { phrase: preview.confirmPhrase })}
      </p>
      <div class="staff-form-row">
        <label for="confirm-phrase">{t('ops.maintenanceConfirmLabel')}</label>
        <input
          id="confirm-phrase"
          type="text"
          bind:value={confirmPhrase}
          autocomplete="off"
          spellcheck="false"
          disabled={busy}
          placeholder={preview.confirmPhrase}
        />
      </div>
      <div class="staff-actions">
        <Button
          type="button"
          variant="danger"
          disabled={busy || !phraseMatches}
          loading={busy}
          onclick={() => void handleReset()}
        >
          {t('ops.maintenanceResetButton')}
        </Button>
      </div>
    </section>
  {/if}
</StaffSettingsShell>
