<script lang="ts">
  import { onMount } from 'svelte';
  import { BellRing, ChevronRight, TriangleAlert } from '@lucide/svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { raiseTerminalEmergency } from '$lib/terminal/terminal-api';
  import {
    refreshTerminalOpsHeartbeat,
    terminalOps,
  } from '$lib/terminal/terminal-ops-runtime.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    disabled?: boolean;
    /** From terminal heartbeat (`terminalOps.emergencyActive`). */
    emergencyActive?: boolean;
  }

  let { disabled = false, emergencyActive = false }: Props = $props();

  const COUNTDOWN_SEC = 3;

  let counting = $state(false);
  let remaining = $state(COUNTDOWN_SEC);
  let done = $state(false);
  /** Blocks release-sync until post-raise heartbeat refresh finishes (avoids sync-turn reset). */
  let suppressReleaseSync = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function reset() {
    clearTimer();
    counting = false;
    remaining = COUNTDOWN_SEC;
    done = false;
    suppressReleaseSync = false;
  }

  $effect(() => {
    if (suppressReleaseSync) {
      return;
    }

    if (emergencyActive) {
      done = true;
      clearTimer();
      counting = false;
      return;
    }

    if (done) {
      reset();
    }
  });

  function startCountdown() {
    if (disabled || counting || done) {
      return;
    }
    counting = true;
    remaining = COUNTDOWN_SEC;
    clearTimer();
    timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearTimer();
        void triggerAlarm();
      }
    }, 1000);
  }

  async function triggerAlarm() {
    counting = false;
    const result = await raiseTerminalEmergency();
    if (!result.ok) {
      toastStore.error(mapEmergencyError(result.error.code, result.error.message));
      reset();
      return;
    }

    done = true;
    suppressReleaseSync = true;
    await refreshTerminalOpsHeartbeat();
    suppressReleaseSync = false;

    // Fast MFA release (or never-active): read runtime, not prop (prop may lag one flush).
    if (!terminalOps.emergencyActive) {
      reset();
    }
  }

  function mapEmergencyError(code: string | undefined, fallback: string): string {
    switch (code) {
      case 'EMERGENCY_DISABLED':
        return t('terminal.emergencyErrorDisabled');
      case 'CHECKIN_LOCKED':
        return t('terminal.emergencyErrorLocked');
      default:
        return fallback || t('terminal.emergencyErrorFallback');
    }
  }

  onMount(() => {
    return () => {
      clearTimer();
    };
  });
</script>

<section class="terminal-emergency" aria-label={t('terminal.emergencySectionAria')}>
  {#if !done}
    <div class="terminal-emergency-bar">
      <button
        type="button"
        class="terminal-card terminal-card--emergency"
        class:terminal-card--emergency-counting={counting}
        {disabled}
        onclick={startCountdown}
      >
        {#if counting}
          <span
            class="terminal-card__emergency-count"
            aria-live="polite"
            aria-label={tf('terminal.emergencyCountdownAria', { remaining })}
          >{remaining}</span>
        {:else}
          <span class="terminal-card__icon terminal-card__icon--emergency" aria-hidden="true">
            <TriangleAlert size={26} />
          </span>
          <span class="terminal-card__text">
            <strong>{t('terminal.emergencyReport')}</strong>
            <span>{tf('terminal.emergencyReportHint', { seconds: COUNTDOWN_SEC })}</span>
          </span>
          <ChevronRight class="terminal-card__chevron" aria-hidden="true" />
        {/if}
      </button>
      {#if counting}
        <button type="button" class="terminal-emergency-cancel" onclick={reset}>{t('terminal.emergencyCancel')}</button>
      {/if}
    </div>
  {:else}
    <p class="alert alert--error alert--icon-row terminal-emergency-done" role="status">
      <BellRing aria-hidden="true" />
      <span>{t('terminal.emergencyDone')}</span>
    </p>
  {/if}
</section>
