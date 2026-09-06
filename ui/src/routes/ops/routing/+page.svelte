<script lang="ts">
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import OpsRoutingSettings from '$lib/components/ops/OpsRoutingSettings.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

<StaffSettingsShell title={t('ops.routing.title')} lead={t('ops.routing.lead')}>
  <section class="panel">
    <OpsRoutingSettings />
  </section>
</StaffSettingsShell>
