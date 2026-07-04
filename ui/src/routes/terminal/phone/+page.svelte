<script lang="ts">
  import { goto } from '$app/navigation';
  import { getContext } from 'svelte';
  import TerminalNumpad from '$lib/components/terminal/TerminalNumpad.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { mountTerminalAuthRouteGuard } from '$lib/terminal/terminal-auth-route-guard.svelte';
  import { TERMINAL_OPS_CONTEXT_KEY, type TerminalOpsSnapshot } from '$lib/terminal/terminal-ops-context';
  import { writeTerminalSession } from '$lib/terminal/terminal-session';

  const terminalOps = getContext<TerminalOpsSnapshot>(TERMINAL_OPS_CONTEXT_KEY);

  mountTerminalAuthRouteGuard(() => terminalOps, 'phone_dob');

  function onSubmit(payload: { phoneNumber: string; dobDisplay: string }) {
    writeTerminalSession({
      authPath: 'phone_dob',
      phoneNumber: payload.phoneNumber,
      dobDisplay: payload.dobDisplay,
    });
    void goto('/terminal/topic');
  }
</script>

<div class="terminal-body terminal-body--flow terminal-body--numpad">
  <div class="terminal-numpad-head">
    <h1>{t('terminal.phoneTitle')}</h1>
    <a class="terminal-numpad-back" href="/terminal">{t('terminal.phoneBack')}</a>
  </div>
  <p class="terminal-lead">{t('terminal.phoneLead')}</p>

  <TerminalNumpad onSubmit={onSubmit} />
</div>
