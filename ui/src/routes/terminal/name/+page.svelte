<script lang="ts">
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import { resolve } from '$app/paths';
  import TerminalNameDobPad from '$lib/components/terminal/TerminalNameDobPad.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { mountTerminalAuthRouteGuard } from '$lib/terminal/terminal-auth-route-guard.svelte';
  import { terminalOps } from '$lib/terminal/terminal-ops-runtime.svelte';
  import { writeTerminalSession } from '$lib/terminal/terminal-session';

  mountTerminalAuthRouteGuard(() => terminalOps, 'name_dob');

  function onSubmit(payload: { lastName: string; dobDisplay: string }) {
    writeTerminalSession({
      authPath: 'name_dob',
      lastName: payload.lastName,
      dobDisplay: payload.dobDisplay,
    });
    void gotoResolved('/terminal/topic');
  }
</script>

<div class="terminal-body terminal-body--flow terminal-body--numpad terminal-body--keyboard">
  <div class="terminal-numpad-head">
    <h1>{t('terminal.nameTitle')}</h1>
    <a class="terminal-numpad-back" href={resolve('/terminal')}>{t('terminal.nameBack')}</a>
  </div>
  <p class="terminal-lead">{t('terminal.nameLead')}</p>

  <TerminalNameDobPad onSubmit={onSubmit} />
</div>
