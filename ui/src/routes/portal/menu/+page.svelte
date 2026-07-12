<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronRight, ClipboardList, FileUp } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { ensurePortalSession } from '$lib/portal/ensure-portal-session';
  import type { PortalSessionContext } from '$lib/portal/portal-session';

  let bootstrapping = $state(true);
  let errorMessage = $state<string | null>(null);
  let session = $state<PortalSessionContext | null>(null);

  onMount(() => {
    const ticketFromUrl = new URL(window.location.href).searchParams.get('ticket');
    void (async () => {
      const result = await ensurePortalSession(ticketFromUrl, { replacePath: '/portal/menu' });
      bootstrapping = false;
      if (!result.ok) {
        errorMessage = result.errorMessage;
        return;
      }
      session = result.session;
    })();
  });
</script>

<div class="staff-page staff-page--narrow">
  {#if bootstrapping}
    <section class="card">
      <p class="text-muted">{t('ui.loading')}</p>
    </section>
  {:else if errorMessage}
    <section class="card flex flex-col gap-2">
      <div class="alert alert--error">{errorMessage}</div>
      <p class="text-muted">{t('portal.sessionMissingHint')}</p>
    </section>
  {:else if session}
    <section class="card flex flex-col gap-2">
      <div class="portal-session-badge">
        <span class="portal-session-label">{t('portal.sessionLabel')}</span>
        <span class="portal-session-ticket">{session.ticketCode}</span>
      </div>

      <header>
        <h1 class="page-title">{t('portal.menuTitle')}</h1>
      </header>

      <div class="portal-action-grid">
        <a class="panel panel--clickable" href={resolve('/portal/upload')}>
          <span class="portal-action-icon" aria-hidden="true">
            <FileUp size={26} strokeWidth={2} />
          </span>
          <span class="panel__text">
            <strong>{t('portal.menuUploadTitle')}</strong>
            <span>{t('portal.menuUploadSubtitle')}</span>
          </span>
          <ChevronRight class="portal-action-chevron" aria-hidden="true" size={22} />
        </a>

        <a class="panel panel--clickable" href={resolve('/portal/anamnese')}>
          <span class="portal-action-icon" aria-hidden="true">
            <ClipboardList size={26} strokeWidth={2} />
          </span>
          <span class="panel__text">
            <strong>{t('portal.menuAnamneseTitle')}</strong>
            <span>{t('portal.menuAnamneseSubtitle')}</span>
          </span>
          <ChevronRight class="portal-action-chevron" aria-hidden="true" size={22} />
        </a>
      </div>
    </section>
  {/if}
</div>
