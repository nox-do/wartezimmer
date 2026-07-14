<script lang="ts">
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { authSession, loadAuthSession, shouldLoadAuthSession } from '$lib/auth/session-state.svelte';
  import type { AuthSessionUser } from '$lib/auth/session-client';

  interface Props {
    loginHref?: string;
    requiredRole?: AuthSessionUser['roles'][number];
    children?: Snippet;
  }

  let { loginHref = '/mfa/login', requiredRole, children }: Props = $props();

  const authenticated = $derived(
    authSession.status === 'authenticated' &&
      (!requiredRole || authSession.user?.roles.includes(requiredRole)),
  );

  function loginTargetWithRedirect(href: string, redirectTarget: string): string {
    const url = new URL(href, window.location.origin);
    if (!url.searchParams.has('redirect')) {
      url.searchParams.set('redirect', redirectTarget);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }

  $effect(() => {
    if (!requiredRole || (requiredRole !== 'mfa' && requiredRole !== 'ops')) {
      return;
    }
    if (shouldLoadAuthSession(requiredRole)) {
      void loadAuthSession(requiredRole);
    }
  });

  $effect(() => {
    if (authenticated || authSession.status === 'idle' || authSession.status === 'loading') {
      return;
    }

    const redirectTarget = `${$page.url.pathname}${$page.url.search}`;
    const target = loginTargetWithRedirect(loginHref, redirectTarget);
    if (`${$page.url.pathname}${$page.url.search}` !== target) {
      void gotoResolved(target, { replaceState: true });
    }
  });
</script>

{#if authenticated}
  {@render children?.()}
{:else}
  <section class="card auth-shell">
    <p class="text-muted">{t('auth.loadingSession')}</p>
  </section>
{/if}
