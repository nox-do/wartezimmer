<script lang="ts">
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import OpsPortalSettings from '$lib/components/ops/OpsPortalSettings.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

<StaffSettingsShell title={t('ops.portalTitle')} lead={t('ops.portalLead')}>
  <section class="panel">
    <OpsPortalSettings />
  </section>
</StaffSettingsShell>
