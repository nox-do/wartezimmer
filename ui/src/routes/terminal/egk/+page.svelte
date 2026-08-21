<script lang="ts">
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import { resolve } from '$app/paths';
  import { ChevronRight, CreditCard } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { mountTerminalAuthRouteGuard } from '$lib/terminal/terminal-auth-route-guard.svelte';
  import { terminalOps } from '$lib/terminal/terminal-ops-runtime.svelte';
  import { writeTerminalSession } from '$lib/terminal/terminal-session';

  mountTerminalAuthRouteGuard(() => terminalOps, 'egk');

  function continueToTopics() {
    writeTerminalSession({ authPath: 'egk' });
    void gotoResolved('/terminal/topic');
  }
</script>

<div class="terminal-body terminal-body--flow">
  <h1>{t('terminal.egkTitle')}</h1>
  <p class="terminal-lead">{t('terminal.egkLead')}</p>

  <div class="terminal-egk-slot terminal-egk-slot--active">
    <CreditCard size={32} aria-hidden="true" />
  </div>

  <p class="terminal-egk-hint">{t('terminal.egkHint')}</p>

  <button type="button" class="terminal-btn--primary" onclick={continueToTopics}>
    {t('terminal.egkContinue')}
    <ChevronRight aria-hidden="true" />
  </button>

  <nav class="terminal-nav">
    <a href={resolve('/terminal')}>{t('terminal.egkBack')}</a>
  </nav>
</div>
