<script lang="ts">
  import '../app.css';
  import GlobalErrorBanner from '$lib/components/GlobalErrorBanner.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import { initI18n, t } from '$lib/i18n/i18nStore.svelte';
  import { getAppInitialLocale } from '$lib/i18n/patient-locale';
  import { getAppSurface } from '$lib/layout/app-surface';
  import { page } from '$app/state';

  let { children } = $props();
  let bootstrapped = $state(false);

  const surface = $derived(getAppSurface(page.url.pathname));

  $effect(() => {
    const pathname = page.url.pathname;
    void initI18n(getAppInitialLocale(pathname)).then(() => {
      bootstrapped = true;
    });
  });
</script>

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
