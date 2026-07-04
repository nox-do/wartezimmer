<script lang="ts">
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import OpsPracticeProfileForm from '$lib/components/ops/OpsPracticeProfileForm.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

<StaffSettingsShell surface="ops" title={t('ops.practice.title')} lead={t('ops.practice.lead')}>
  <section class="panel">
    <OpsPracticeProfileForm variant="settings" />
  </section>
</StaffSettingsShell>
