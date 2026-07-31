<script lang="ts">
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import OpsContactLookupForm from '$lib/components/ops/OpsContactLookupForm.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

<StaffSettingsShell title={t('ops.contactsTitle')} lead={t('ops.contactsLead')}>
  <section class="panel">
    <OpsContactLookupForm variant="settings" />
  </section>
</StaffSettingsShell>
