<script lang="ts">
  import '$lib/styles/portal.css';
  import { onMount } from 'svelte';
  import PatientLangPicker from '$lib/components/shared/PatientLangPicker.svelte';
  import { fetchPatientLocales } from '$lib/ops/patient-locales-api';
  import { clearPortalSession } from '$lib/portal/portal-session';
  import { DEFAULT_TERMINAL_PATIENT_LOCALES, type TerminalPatientLocale } from '@praxis-flow/domain';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { page } from '$app/stores';

  let { children } = $props();

  let enabledLocales = $state<TerminalPatientLocale[]>([...DEFAULT_TERMINAL_PATIENT_LOCALES]);
  let portalEnabled = $state<boolean | null>(null);

  const isPortalEntry = $derived($page.url.pathname === '/portal');

  onMount(() => {
    let stopped = false;

    async function refresh() {
      const result = await fetchPatientLocales();
      if (stopped || !result.ok) {
        return;
      }
      enabledLocales = result.data.terminalPatientLocales;
      if (result.data.portalEnabled === false) {
        clearPortalSession();
      }
      portalEnabled = result.data.portalEnabled;
    }

    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  });
</script>

<div class="portal-page" class:portal-page--entry={isPortalEntry}>
  {#if isPortalEntry}
    <PatientLangPicker {enabledLocales} placement="corner" />
  {/if}
  {#if portalEnabled === false}
    <section class="panel portal-disabled">
      <p class="portal-disabled__kicker">{t('portal.indexKicker')}</p>
      <h1 class="portal-disabled__title">{t('portal.disabledTitle')}</h1>
      <p class="text-desc">{t('portal.disabledLead')}</p>
    </section>
  {:else if portalEnabled === true}
    {@render children()}
  {:else}
    <p class="text-muted portal-disabled__loading">{t('ui.loading')}</p>
  {/if}
</div>

<style>
  .portal-disabled {
    max-width: 32rem;
    margin: 2rem auto;
    text-align: center;
  }

  .portal-disabled__kicker {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .portal-disabled__title {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
  }

  .portal-disabled__loading {
    margin: 2rem auto;
    text-align: center;
  }
</style>
