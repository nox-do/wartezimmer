<script lang="ts">
  import OpsPinSettings from '$lib/components/ops/OpsPinSettings.svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

<StaffSettingsShell surface="ops" title={t('ops.securityTitle')} lead={t('ops.securityLead')}>
  <OpsPinSettings />
</StaffSettingsShell>
