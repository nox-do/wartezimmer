<script lang="ts">
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { ChevronRight, CreditCard, IdCard, Smartphone, Users } from '@lucide/svelte';
  import TerminalAssistanceModal from '$lib/components/terminal/TerminalAssistanceModal.svelte';
  import TerminalPrivacyModal from '$lib/components/terminal/TerminalPrivacyModal.svelte';
  import TerminalWlanPromoBanner from '$lib/components/terminal/TerminalWlanPromoBanner.svelte';
  import TerminalLockedScreen from '$lib/components/terminal/TerminalLockedScreen.svelte';
  import {
    getPracticeProfileFallback,
    mountPracticeProfileSync,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { locale, t, tf } from '$lib/i18n/i18nStore.svelte';
  import { terminalOps } from '$lib/terminal/terminal-ops-runtime.svelte';
  import {
    createAssistanceCheckin,
    createCheckin,
    mapCheckinErrorMessage,
  } from '$lib/terminal/terminal-api';
  import { getTerminalPrivacyNotice } from '$lib/privacy/terminal-notice';
  import { writeCheckinResult } from '$lib/terminal/terminal-session';
  import { toastStore } from '$lib/stores/toastStore';

  let busy = $state(false);
  let assistanceConfirmOpen = $state(false);
  let privacyModalOpen = $state(false);
  let practiceProfile = $state(getPracticeProfileFallback());

  const privacyNotice = $derived(getTerminalPrivacyNotice(practiceProfile));
  const practiceName = $derived(practiceDisplayLabel(practiceProfile, t('terminal.practiceFallback')));
  const loading = $derived(terminalOps.loading);
  const checkinLocked = $derived(terminalOps.checkinLocked);
  const wlanPromoEnabled = $derived(terminalOps.terminalWlanPromoEnabled);
  const authPhoneEnabled = $derived(terminalOps.terminalAuthPhoneEnabled);
  const authNameDobEnabled = $derived(terminalOps.terminalAuthNameDobEnabled);
  const authEgkEnabled = $derived(terminalOps.terminalAuthEgkEnabled);

  onMount(() => {
    const stopProfile = mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });
    return () => {
      stopProfile();
    };
  });

  async function createAssistance() {
    if (busy) {
      return;
    }
    busy = true;
    const result = await createAssistanceCheckin($locale);
    busy = false;
    if (!result.ok) {
      toastStore.error(mapCheckinErrorMessage(result.error.code, result.error.message));
      return;
    }

    assistanceConfirmOpen = false;
    writeCheckinResult({
      visitId: result.data.visitId,
      laneCode: result.data.laneCode,
      number: result.data.number,
      topicId: 'mfa',
      topicLabel: t('terminal.assistanceTicketTopic'),
      destinationRoomLabel: result.data.destinationRoomLabel ?? null,
      authPath: 'none',
      createdAt: result.data.createdAt,
      needsAssistance: true,
    });
    void gotoResolved('/terminal/confirmed');
  }

  async function createReceptionCheckin() {
    if (busy) {
      return;
    }
    busy = true;
    const result = await createCheckin({
      topicId: 'mfa',
      authPath: 'none',
      patientLocale: $locale,
    });
    busy = false;
    if (!result.ok) {
      toastStore.error(mapCheckinErrorMessage(result.error.code, result.error.message));
      return;
    }

    writeCheckinResult({
      visitId: result.data.visitId,
      laneCode: result.data.laneCode,
      number: result.data.number,
      topicId: 'mfa',
      topicLabel: t('terminal.receiptTopicEmpfang'),
      destinationRoomLabel: result.data.destinationRoomLabel ?? null,
      authPath: 'none',
      createdAt: result.data.createdAt,
    });
    void gotoResolved('/terminal/confirmed');
  }
</script>

<div
  class="terminal-body terminal-body--flow"
  class:terminal-body--start={!checkinLocked}
  class:terminal-body--locked={checkinLocked}
>
  {#if loading}
    <p class="terminal-loading">{t('ui.loading')}</p>
  {:else if checkinLocked}
    <TerminalLockedScreen />
  {:else}
    <header class="terminal-intro">
      <h1>{t('terminal.startTitle')}</h1>
      <p class="terminal-intro-welcome">{tf('terminal.startWelcome', { practiceName })}</p>
      <p class="terminal-privacy-voluntary">{t('terminal.privacyVoluntaryNote')}</p>
      <button type="button" class="terminal-privacy-link" onclick={() => (privacyModalOpen = true)}>
        {t('terminal.privacyOpenLink')}
      </button>
    </header>

    <div class="terminal-card-grid terminal-card-grid--start">
      {#if authPhoneEnabled}
        <a class="terminal-card" href={resolve('/terminal/phone')}>
          <span class="terminal-card__icon" aria-hidden="true">
            <Smartphone size={26} />
          </span>
          <span class="terminal-card__text">
            <strong>{t('terminal.authPhoneTitle')}</strong>
            <span>{t('terminal.authPhoneSubtitle')}</span>
          </span>
          <ChevronRight class="terminal-card__chevron" aria-hidden="true" />
        </a>
      {/if}

      {#if authNameDobEnabled}
        <a class="terminal-card" href={resolve('/terminal/name')}>
          <span class="terminal-card__icon" aria-hidden="true">
            <IdCard size={26} />
          </span>
          <span class="terminal-card__text">
            <strong>{t('terminal.authNameDobTitle')}</strong>
            <span>{t('terminal.authNameDobSubtitle')}</span>
          </span>
          <ChevronRight class="terminal-card__chevron" aria-hidden="true" />
        </a>
      {/if}

      {#if authEgkEnabled}
        <a class="terminal-card" href={resolve('/terminal/egk')}>
          <span class="terminal-card__icon" aria-hidden="true">
            <CreditCard size={26} />
          </span>
          <span class="terminal-card__text">
            <strong>{t('terminal.authEgkTitle')}</strong>
            <span>{t('terminal.authEgkSubtitle')}</span>
          </span>
          <ChevronRight class="terminal-card__chevron" aria-hidden="true" />
        </a>
      {/if}

      <button type="button" class="terminal-card" disabled={busy} onclick={createReceptionCheckin}>
        <span class="terminal-card__icon" aria-hidden="true">
          <Users size={26} />
        </span>
        <span class="terminal-card__text">
          <strong>{t('terminal.authMfaTitle')}</strong>
          <span>{t('terminal.authMfaSubtitle')}</span>
        </span>
        <ChevronRight class="terminal-card__chevron" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="terminal-card terminal-card--assistance"
        disabled={busy}
        onclick={() => (assistanceConfirmOpen = true)}
      >
        <span class="terminal-card__icon" aria-hidden="true">
          <Users size={26} />
        </span>
        <span class="terminal-card__text">
          <strong>{t('terminal.assistanceTitle')}</strong>
          <span>{t('terminal.assistanceSubtitle')}</span>
        </span>
        <ChevronRight class="terminal-card__chevron" aria-hidden="true" />
      </button>
    </div>

    {#if wlanPromoEnabled}
      <TerminalWlanPromoBanner />
    {/if}

    <TerminalPrivacyModal bind:open={privacyModalOpen} notice={privacyNotice} />
    <TerminalAssistanceModal
      bind:open={assistanceConfirmOpen}
      {busy}
      onConfirm={() => void createAssistance()}
    />
  {/if}
</div>
