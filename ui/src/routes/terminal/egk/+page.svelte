<script lang="ts">
  import { goto } from '$app/navigation';
  import { getContext } from 'svelte';
  import { ChevronRight, CreditCard } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { mountTerminalAuthRouteGuard } from '$lib/terminal/terminal-auth-route-guard.svelte';
  import { TERMINAL_OPS_CONTEXT_KEY, type TerminalOpsSnapshot } from '$lib/terminal/terminal-ops-context';
  import { writeTerminalSession } from '$lib/terminal/terminal-session';

  const terminalOps = getContext<TerminalOpsSnapshot>(TERMINAL_OPS_CONTEXT_KEY);

  mountTerminalAuthRouteGuard(() => terminalOps, 'egk');

  function continueToTopics() {
    writeTerminalSession({ authPath: 'egk' });
    void goto('/terminal/topic');
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
    <a href="/terminal">{t('terminal.egkBack')}</a>
  </nav>
</div>
