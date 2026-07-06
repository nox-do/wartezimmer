import { goto } from '$app/navigation';
import { t } from '$lib/i18n/i18nStore.svelte';
import { toastStore } from '$lib/stores/toastStore';
import {
  shouldRedirectFromTerminalAuthRoute,
  type TerminalAuthRoutePath,
} from './terminal-auth-route-guard';
import type { TerminalAuthPath } from './terminal-api';
import type { TerminalOpsSnapshot } from './terminal-ops-context';
import { clearTerminalSession } from './terminal-session';

function resolveAuthPath(
  authPath: TerminalAuthPath | (() => TerminalAuthPath | null),
): TerminalAuthRoutePath | null {
  const resolved = typeof authPath === 'function' ? authPath() : authPath;
  if (resolved === 'none') {
    return null;
  }
  return resolved;
}

export function mountTerminalAuthRouteGuard(
  getOps: () => TerminalOpsSnapshot,
  authPath: TerminalAuthPath | (() => TerminalAuthPath | null),
): void {
  let redirected = false;

  $effect(() => {
    if (redirected) {
      return;
    }

    const path = resolveAuthPath(authPath);
    if (!path) {
      return;
    }

    if (!shouldRedirectFromTerminalAuthRoute(getOps(), path)) {
      return;
    }

    redirected = true;
    clearTerminalSession();
    toastStore.error(t('terminal.authPathDisabled'));
    void goto('/terminal');
  });
}
