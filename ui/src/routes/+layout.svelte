<script lang="ts">
  import '../app.css';
  import GlobalErrorBanner from '$lib/components/GlobalErrorBanner.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import { initI18n, t } from '$lib/i18n/i18nStore.svelte';
  import { getAppInitialLocale } from '$lib/i18n/patient-locale';
  import { getAppSurface } from '$lib/layout/app-surface';
  import { page } from '$app/state';
  import { APP_TITLES, PRODUCT_NAME } from '$lib/brand';
  import { onMount } from 'svelte';
  import { mountStaffSessionSync } from '$lib/auth/staff-session-sync';
  import { refreshAuthSession } from '$lib/auth/session-state.svelte';

  onMount(() => mountStaffSessionSync((role) => {
    void refreshAuthSession(role);
  }));

  let { children } = $props();
  let bootstrapped = $state(false);

  const surface = $derived(getAppSurface(page.url.pathname));
  const titleSurface = $derived(
    page.url.pathname === '/mfa/login' && page.url.searchParams.get('role') === 'ops'
      ? 'ops'
      : page.url.pathname.split('/')[1],
  );
  const appTitle = $derived(APP_TITLES[titleSurface] ?? PRODUCT_NAME);

  $effect(() => {
    const pathname = page.url.pathname;
    void initI18n(getAppInitialLocale(pathname)).then(() => {
      bootstrapped = true;
    });
  });
</script>

<svelte:head>
  <title>{appTitle}</title>
  <meta name="application-name" content={PRODUCT_NAME} />
</svelte:head>

<div class="app-shell">
  <main class="app-main" data-surface={surface ?? undefined}>
    {#if bootstrapped}
      {@render children()}
    {:else}
      <p class="text-muted">{t('ui.loading')}</p>
    {/if}
  </main>
</div>

<ToastContainer />
<GlobalErrorBanner />
