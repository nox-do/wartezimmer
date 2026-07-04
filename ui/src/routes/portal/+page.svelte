<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import Button from '$lib/components/forms/Button.svelte';
  import PrivacyNoticeModal from '$lib/components/shared/PrivacyNoticeModal.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { getPortalEntryPrivacyNotice } from '$lib/privacy/portal-entry-notice';
  import { getPracticeProfileFallback, mountPracticeProfileSync } from '$lib/practice/practice-profile-client';
  import {
    clearCaptivePortalContext,
    readCaptivePortalContext,
    readCaptivePortalContextFromUrl,
    storeCaptivePortalContext,
    stripCaptivePortalQuery,
  } from '$lib/portal/captive-portal-context';
  import { formatTicketCodeInput, normalizeTicketCode } from '$lib/portal/normalize-ticket-code';
  import { activatePortalSession } from '$lib/portal/portal-session';
  import { authorizeCaptivePortalSession, resolvePortalSession } from '$lib/portal/session-api';

  let ticketInput = $state('');
  let termsAccepted = $state(false);
  let privacyModalOpen = $state(false);
  let practiceProfile = $state(getPracticeProfileFallback());

  const privacyNotice = $derived(getPortalEntryPrivacyNotice(practiceProfile));

  function handleTicketInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const next = input.value;
    const adding = next.length > ticketInput.length;
    ticketInput = formatTicketCodeInput(next, { appendDashAfterLetter: adding });
  }
  let formError = $state<string | null>(null);
  let submitting = $state(false);

  onMount(() => {
    const stopProfile = mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });

    const currentUrl = new URL(window.location.href);
    const captiveContext = readCaptivePortalContextFromUrl(currentUrl);
    if (!captiveContext) {
      return stopProfile;
    }

    storeCaptivePortalContext(captiveContext);
    const cleaned = stripCaptivePortalQuery(currentUrl);
    replaceState(`${cleaned.pathname}${cleaned.search}`, {});

    return stopProfile;
  });

  async function startPortal(event: SubmitEvent) {
    event.preventDefault();
    formError = null;

    if (!termsAccepted) {
      formError = t('portal.indexTermsRequired');
      return;
    }

    const normalized = normalizeTicketCode(ticketInput);
    if (!normalized) {
      formError = t('portal.invalidTicket');
      return;
    }

    submitting = true;
    try {
      const resolved = await resolvePortalSession(normalized);
      if (!resolved.ok) {
        formError = resolved.error.message || t('portal.sessionResolveError');
        return;
      }

      await activatePortalSession({
        sessionToken: resolved.data.sessionToken,
        ticketCode: normalized,
        ticketId: resolved.data.ticketId,
      });

      const captiveContext = readCaptivePortalContext();
      const menuPath = '/portal/menu';

      if (captiveContext?.clientIp || captiveContext?.clientMac) {
        const menuUrl = `${window.location.origin}${menuPath}`;
        const authorized = await authorizeCaptivePortalSession(resolved.data.sessionToken, {
          clientIp: captiveContext.clientIp,
          clientMac: captiveContext.clientMac,
          redirectUrl: menuUrl,
        });

        if (!authorized.ok) {
          formError = authorized.error.message || t('portal.captiveAuthorizeError');
          return;
        }

        clearCaptivePortalContext();

        if (authorized.data.wlanAuthorized && authorized.data.redirectUrl.startsWith('http')) {
          window.location.assign(authorized.data.redirectUrl);
          return;
        }
      }

      await goto(menuPath);
    } finally {
      submitting = false;
    }
  }
</script>

<section class="staff-page staff-page--narrow">
  <p class="portal-kicker">{t('portal.indexKicker')}</p>
  <h1 class="page-title">{t('portal.indexTitle')}</h1>
  <p class="page-lead">
    {t('portal.indexLeadPart1')}<strong>{t('portal.indexLeadBold')}</strong>{t('portal.indexLeadPart2')}
  </p>

  <form class="modal-form" onsubmit={startPortal}>
    <div class="portal-terms">
      <label>
        <input type="checkbox" bind:checked={termsAccepted} disabled={submitting} />
        <span>{t('portal.indexTermsLabel')}</span>
      </label>
      <p class="mb-2" style="margin-left: 1.75rem;">
        <button type="button" class="portal-text-button" onclick={() => (privacyModalOpen = true)}>
          {t('portal.indexPrivacyOpen')}
        </button>
      </p>
    </div>

    <label class="modal-form-field" for="portal-ticket-input">
      {t('portal.ticketInputLabel')}
      <input
        id="portal-ticket-input"
        class="form-input portal-ticket-input"
        type="text"
        value={ticketInput}
        oninput={handleTicketInput}
        placeholder={t('portal.ticketInputPlaceholder')}
        autocomplete="off"
        spellcheck="false"
        autocapitalize="characters"
        inputmode="text"
        maxlength="6"
        disabled={submitting}
      />
    </label>

    <Button type="submit" variant="primary" fullWidth disabled={submitting}>
      {submitting ? t('portal.indexSubmitting') : t('portal.indexContinue')}
    </Button>
  </form>

  {#if formError}
    <div class="alert alert--error mt-2">{formError}</div>
  {/if}
</section>

<PrivacyNoticeModal bind:open={privacyModalOpen} notice={privacyNotice} />

