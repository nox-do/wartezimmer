<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ChevronRight, CreditCard, IdCard, Smartphone, Users } from '@lucide/svelte';
  import { getContext } from 'svelte';
  import TerminalEmergencyBar from '$lib/components/terminal/TerminalEmergencyBar.svelte';
  import TerminalPrivacyModal from '$lib/components/terminal/TerminalPrivacyModal.svelte';
  import TerminalWlanPromoBanner from '$lib/components/terminal/TerminalWlanPromoBanner.svelte';
  import TerminalLockedScreen from '$lib/components/terminal/TerminalLockedScreen.svelte';
  import {
    getPracticeProfileFallback,
    mountPracticeProfileSync,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import {
    TERMINAL_OPS_CONTEXT_KEY,
    type TerminalOpsSnapshot,
  } from '$lib/terminal/terminal-ops-context';
  import {
    createMfaAssistCheckin,
    mapCheckinErrorMessage,
  } from '$lib/terminal/terminal-api';
  import { getTerminalPrivacyNotice } from '$lib/privacy/terminal-notice';
  import { resetTerminalFlow, writeCheckinResult } from '$lib/terminal/terminal-session';
  import { toastStore } from '$lib/stores/toastStore';

  const terminalOps = getContext<TerminalOpsSnapshot>(TERMINAL_OPS_CONTEXT_KEY);

  let busy = $state(false);
  let privacyModalOpen = $state(false);
  let practiceProfile = $state(getPracticeProfileFallback());

  const privacyNotice = $derived(getTerminalPrivacyNotice(practiceProfile));
  const practiceName = $derived(practiceDisplayLabel(practiceProfile, t('terminal.practiceFallback')));
  const loading = $derived(terminalOps?.loading ?? true);
  const checkinLocked = $derived(terminalOps?.checkinLocked ?? false);
  const emergencyEnabled = $derived(terminalOps?.emergencyEnabled ?? false);
  const wlanPromoEnabled = $derived(terminalOps?.terminalWlanPromoEnabled ?? false);
  const authPhoneEnabled = $derived(terminalOps?.terminalAuthPhoneEnabled ?? false);
  const authNameDobEnabled = $derived(terminalOps?.terminalAuthNameDobEnabled ?? false);
  const authEgkEnabled = $derived(terminalOps?.terminalAuthEgkEnabled ?? false);

  onMount(() => {
    return mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });
  });

  async function onMfaAssist() {
    busy = true;
    const result = await createMfaAssistCheckin();
    busy = false;
    if (!result.ok) {
      toastStore.error(mapCheckinErrorMessage(result.error.code, result.error.message));
      return;
    }

    resetTerminalFlow();
    writeCheckinResult({
      ticketId: result.data.ticketId,
      laneCode: result.data.laneCode,
      number: result.data.number,
      topicId: 'mfa',
      topicLabel: t('terminal.receiptTopicEmpfang'),
      destinationRoomLabel: result.data.destinationRoomLabel ?? null,
      authPath: 'mfa_assist',
      createdAt: result.data.createdAt,
    });
    void goto('/terminal/confirmed');
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
        <a class="terminal-card" href="/terminal/phone">
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
        <a class="terminal-card" href="/terminal/name">
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
        <a class="terminal-card" href="/terminal/egk">
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

      <button type="button" class="terminal-card" disabled={busy} onclick={onMfaAssist}>
        <span class="terminal-card__icon" aria-hidden="true">
          <Users size={26} />
        </span>
        <span class="terminal-card__text">
          <strong>{t('terminal.authMfaTitle')}</strong>
          <span>{t('terminal.authMfaSubtitle')}</span>
        </span>
        <ChevronRight class="terminal-card__chevron" aria-hidden="true" />
      </button>
    </div>

    {#if wlanPromoEnabled}
      <TerminalWlanPromoBanner />
    {/if}

    {#if emergencyEnabled}
      <TerminalEmergencyBar />
    {/if}

    <TerminalPrivacyModal bind:open={privacyModalOpen} notice={privacyNotice} />
  {/if}
</div>
