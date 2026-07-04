<script lang="ts">
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

<StaffSettingsShell
  surface="mfa"
  variant="hub"
  title={t('mfa.settings.hubTitle')}
>
  <p class="staff-settings__hub-aside">
    <a href="/ops" target="_blank" rel="noopener noreferrer" aria-label={t('mfa.settings.hubOpsLinkAria')}>
      {t('mfa.settings.hubOpsLink')}
    </a>
  </p>

  <div class="settings-grid">
    <a class="panel panel--clickable" href="/mfa/settings/operations">
      <span>
        <strong>{t('mfa.settings.cardBetriebTitle')}</strong>
        <span>{t('mfa.settings.cardBetriebDesc')}</span>
      </span>
    </a>
    <a class="panel panel--clickable" href="/mfa/settings/topics-rooms">
      <span>
        <strong>{t('mfa.settings.cardThemesRoomsTitle')}</strong>
        <span>{t('mfa.settings.cardThemesRoomsDesc')}</span>
      </span>
    </a>
  </div>
</StaffSettingsShell>
