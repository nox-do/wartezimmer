<script lang="ts">
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import {
    loadAuthSession,
    shouldLoadAuthSession,
    staffAuthSlots,
  } from '$lib/auth/session-state.svelte';
  import type { StaffAuthRole } from '$lib/auth/session-client';

  interface Props {
    loginHref?: string;
    requiredRole?: StaffAuthRole;
    children?: Snippet;
  }

  let { loginHref = '/mfa/login', requiredRole, children }: Props = $props();

  const authSlot = $derived(requiredRole ? staffAuthSlots[requiredRole] : staffAuthSlots.mfa);

  const authenticated = $derived(
    authSlot.status === 'authenticated' &&
      (!requiredRole || authSlot.user?.role === requiredRole),
  );

  function loginTargetWithRedirect(href: string, redirectTarget: string): string {
    const url = new URL(href, window.location.origin);
    if (!url.searchParams.has('redirect')) {
      url.searchParams.set('redirect', redirectTarget);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }

  $effect(() => {
    if (!requiredRole) {
      return;
    }
    if (shouldLoadAuthSession(requiredRole)) {
      void loadAuthSession(requiredRole);
    }
  });

  $effect(() => {
    if (authenticated || authSlot.status === 'idle' || authSlot.status === 'loading') {
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
