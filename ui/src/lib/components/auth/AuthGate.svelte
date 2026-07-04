<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { authSession, loadAuthSession } from '$lib/auth/session-state.svelte';
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

  onMount(() => {
    if (authSession.status === 'idle') {
      void loadAuthSession();
    }
  });

  $effect(() => {
    if (authenticated || authSession.status === 'idle' || authSession.status === 'loading') {
      return;
    }

    const redirectTarget = `${$page.url.pathname}${$page.url.search}`;
    const target = loginTargetWithRedirect(loginHref, redirectTarget);
    if (`${$page.url.pathname}${$page.url.search}` !== target) {
      void goto(target, { replaceState: true });
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
