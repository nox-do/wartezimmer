<script lang="ts">
  import { Lock, MapPin } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

<section class="terminal-off-screen" aria-labelledby="terminal-off-title">
  <div class="terminal-off-icon" aria-hidden="true">
    <Lock size={36} strokeWidth={2} />
  </div>

  <span class="pill pill--caps pill--neutral terminal-off-badge">{t('terminal.lockedBadge')}</span>

  <h1 id="terminal-off-title" class="terminal-off-title">{t('terminal.lockedTitle')}</h1>

  <p class="terminal-off-lead">{t('terminal.lockedLead')}</p>

  <div class="terminal-callout terminal-callout--panel">
    <div class="terminal-callout__head">
      <MapPin size={22} aria-hidden="true" />
      <strong>{t('terminal.lockedReceptionTitle')}</strong>
    </div>
    <p>{t('terminal.lockedReceptionText')}</p>
  </div>

  <p class="alert alert--error terminal-off-emergency">{t('terminal.lockedEmergency')}</p>
</section>
