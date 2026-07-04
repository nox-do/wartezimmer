<script lang="ts">
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import OpsSevenMessagingSettings from '$lib/components/ops/OpsSevenMessagingSettings.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

<StaffSettingsShell surface="ops" title={t('ops.messagingTitle')} lead={t('ops.messagingLead')}>
  <OpsSevenMessagingSettings />
</StaffSettingsShell>
