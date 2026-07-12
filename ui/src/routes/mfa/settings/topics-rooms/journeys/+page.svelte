<script lang="ts">
  import { onMount } from 'svelte';
  import MfaSettingsPageHeader from '$lib/components/mfa/MfaSettingsPageHeader.svelte';
  import JourneyAdminEditor from '$lib/components/mfa/JourneyAdminEditor.svelte';
  import {
    normalizeJourneySettingsForSave,
    validateJourneySettingsForSave,
  } from '$lib/mfa/journey-admin-helpers';
  import { journeySettingsErrorMessage } from '$lib/mfa/journey-settings-errors';
  import { fetchRoutingCapabilities, type RoutingCapabilities } from '$lib/mfa/practice-ops-api';
  import type { JourneySettings } from '$lib/ops/openapi-types';
  import { fetchOpsSettings, listEnabledRooms, patchOpsSettings } from '$lib/queue/ops-settings-api';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  let loading = $state(true);
  let saving = $state(false);
  let routingCapabilities = $state<RoutingCapabilities | null>(null);
  let journeySettings = $state<JourneySettings>({ templates: [] });
  let enabledRooms = $state<ReturnType<typeof listEnabledRooms>>([]);

  const journeyDesignerVisible = $derived(
    routingCapabilities?.features.journeyDesigner === true &&
      routingCapabilities?.routingMode === 'complex',
  );
  const enabledRoomIds = $derived(new Set(enabledRooms.map((room) => room.roomId)));

  async function loadPage() {
    loading = true;
    const [settingsResult, capabilitiesResult] = await Promise.all([
      fetchOpsSettings(),
      fetchRoutingCapabilities(),
    ]);
    loading = false;

    if (!settingsResult.ok || !capabilitiesResult.ok) {
      toastStore.error(t('mfa.settings.settingsLoadError'));
      return;
    }

    routingCapabilities = capabilitiesResult.data;
    journeySettings = structuredClone(settingsResult.data.journeySettings);
    enabledRooms = listEnabledRooms(settingsResult.data.rooms);
  }

  async function saveJourneySettings(next: JourneySettings) {
    const validation = validateJourneySettingsForSave(next, enabledRoomIds);
    if (!validation.ok) {
      toastStore.error(t(validation.messageKey));
      return;
    }

    saving = true;
    const result = await patchOpsSettings({
      journeySettings: normalizeJourneySettingsForSave(next),
    });
    saving = false;

    if (!result.ok) {
      toastStore.error(journeySettingsErrorMessage(result.error));
      await loadPage();
      return;
    }

    journeySettings = structuredClone(result.data.journeySettings);
    toastStore.success(t('mfa.settings.journeySaveSuccess'));
  }

  onMount(() => {
    void loadPage();
  });
</script>

<MfaSettingsPageHeader title={t('mfa.settings.journeysPanelTitle')} lead={t('mfa.settings.journeysPanelDesc')} />

{#if loading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else if !journeyDesignerVisible}
  <p class="text-muted">{t('mfa.settings.journeyComplexModeRequired')}</p>
{:else}
  <JourneyAdminEditor
    {journeySettings}
    {enabledRooms}
    busy={saving}
    onChange={(next) => {
      journeySettings = next;
    }}
    onSave={saveJourneySettings}
  />
{/if}
