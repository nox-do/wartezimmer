<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '$lib/components/forms/Button.svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import { patchOpsOnboarding } from '$lib/ops/ops-system-api';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  let { data } = $props();

  let reopenBusy = $state(false);
  let setupCompleted = $derived(Boolean(data.onboardingCompleted));
  let setupChecked = $derived(data.onboardingCompleted !== undefined || Boolean(data.onboardingError));

  async function openSetupAgain() {
    reopenBusy = true;
    const result = await patchOpsOnboarding({ reopenOnboarding: true });
    reopenBusy = false;
    if (!result.ok) {
      toastStore.error(result.error.message || t('ops.loadError'));
      return;
    }
    await goto('/ops/setup');
  }
</script>

<StaffSettingsShell surface="ops" variant="hub" title={t('ops.hubTitle')} lead={t('ops.hubLead')}>
  {#if setupChecked && setupCompleted}
    <div class="staff-actions">
      <Button type="button" variant="outline" size="sm" loading={reopenBusy} disabled={reopenBusy} onclick={() => void openSetupAgain()}>
        {t('ops.setup.reopenLink')}
      </Button>
    </div>
  {/if}
  <p class="text-desc">{t('ops.hubMfaHint')}</p>

  <div class="settings-grid">
    <a class="panel panel--clickable" href="/ops/practice">
      <span>
        <strong>{t('ops.cardPracticeTitle')}</strong>
        <span>{t('ops.cardPracticeDesc')}</span>
      </span>
    </a>
    <a class="panel panel--clickable" href="/ops/storage">
      <span>
        <strong>{t('ops.cardStorageTitle')}</strong>
        <span>{t('ops.cardStorageDesc')}</span>
      </span>
    </a>
    <a class="panel panel--clickable" href="/ops/contacts">
      <span>
        <strong>{t('ops.cardContactsTitle')}</strong>
        <span>{t('ops.cardContactsDesc')}</span>
      </span>
    </a>
    <a class="panel panel--clickable" href="/ops/messaging">
      <span>
        <strong>{t('ops.cardMessagingTitle')}</strong>
        <span>{t('ops.cardMessagingDesc')}</span>
      </span>
    </a>
    <a class="panel panel--clickable" href="/ops/portal">
      <span>
        <strong>{t('ops.cardPortalTitle')}</strong>
        <span>{t('ops.cardPortalDesc')}</span>
      </span>
    </a>
    <a class="panel panel--clickable" href="/ops/security">
      <span>
        <strong>{t('ops.cardSecurityTitle')}</strong>
        <span>{t('ops.cardSecurityDesc')}</span>
      </span>
    </a>
    <a class="panel panel--clickable" href="/ops/maintenance">
      <span>
        <strong>{t('ops.cardMaintenanceTitle')}</strong>
        <span>{t('ops.cardMaintenanceDesc')}</span>
      </span>
    </a>
  </div>
</StaffSettingsShell>
