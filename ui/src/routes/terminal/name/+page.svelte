<script lang="ts">
  import { goto } from '$app/navigation';
  import { getContext } from 'svelte';
  import TerminalNameDobPad from '$lib/components/terminal/TerminalNameDobPad.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { mountTerminalAuthRouteGuard } from '$lib/terminal/terminal-auth-route-guard.svelte';
  import { TERMINAL_OPS_CONTEXT_KEY, type TerminalOpsSnapshot } from '$lib/terminal/terminal-ops-context';
  import { writeTerminalSession } from '$lib/terminal/terminal-session';

  const terminalOps = getContext<TerminalOpsSnapshot>(TERMINAL_OPS_CONTEXT_KEY);

  mountTerminalAuthRouteGuard(() => terminalOps, 'name_dob');

  function onSubmit(payload: { lastName: string; dobDisplay: string }) {
    writeTerminalSession({
      authPath: 'name_dob',
      lastName: payload.lastName,
      dobDisplay: payload.dobDisplay,
    });
    void goto('/terminal/topic');
  }
</script>

<div class="terminal-body terminal-body--flow terminal-body--numpad terminal-body--numpad-wide">
  <div class="terminal-numpad-head">
    <h1>{t('terminal.nameTitle')}</h1>
    <a class="terminal-numpad-back" href="/terminal">{t('terminal.nameBack')}</a>
  </div>
  <p class="terminal-lead">{t('terminal.nameLead')}</p>

  <TerminalNameDobPad onSubmit={onSubmit} />
</div>
