<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { beginPairingSubmit, finishPairingSubmit } from '$lib/mfa/pairing-submit-ui';
  import {
    beginDeviceConnectionWait,
    waitForDevicePresenceOnline,
  } from '$lib/mfa/ops-stream-store.svelte';
  import type { DevicePairingConfirmResponse } from '$lib/auth/device-pairing-client';
  import type { Result } from '$lib/types/result';

  type Props = {
    variant?: 'page' | 'inline';
    kickerKey?: string;
    titleKey?: string;
    leadKey?: string;
    codeLabelKey: string;
    submitKey: string;
    submittingKey: string;
    successKey: string;
    errorKey: string;
    connectingKey?: string;
    deviceId?: string;
    showSuccessMessage?: boolean;
    confirm: (code: string) => Promise<Result<DevicePairingConfirmResponse>>;
  };

  let {
    variant = 'page',
    kickerKey,
    titleKey,
    leadKey,
    codeLabelKey,
    submitKey,
    submittingKey,
    successKey,
    errorKey,
    connectingKey = 'mfa.pairingConnecting',
    deviceId,
    showSuccessMessage = variant === 'page',
    confirm,
  }: Props = $props();

  let code = $state('');
  let submitting = $state(false);
  let message = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let cancelPresenceWait: (() => void) | null = null;

  onDestroy(() => {
    cancelPresenceWait?.();
  });

  function normalizeCode(value: string): string {
    return value.replace(/\D/g, '').slice(0, 4);
  }

  async function handleSubmit() {
    submitting = true;
    message = null;
    errorMessage = null;
    const submitStartedAt = await beginPairingSubmit();
    try {
      const result = await confirm(normalizeCode(code));
      if (!result.ok) {
        errorMessage =
          result.error.status === 404 ? t('mfa.pairingCodeNotFound') : result.error.message || t(errorKey);
        return;
      }

      if (deviceId) {
        beginDeviceConnectionWait(deviceId);

        if (variant === 'inline') {
          code = '';
          return;
        }

        const wait = waitForDevicePresenceOnline(deviceId);
        cancelPresenceWait = wait.cancel;
        const online = await wait.promise;
        cancelPresenceWait = null;
        if (!online) {
          errorMessage = t(errorKey);
          return;
        }
      }

      code = '';
      if (showSuccessMessage) {
        message = t(successKey);
      }
    } finally {
      await finishPairingSubmit(submitStartedAt);
      cancelPresenceWait?.();
      cancelPresenceWait = null;
      submitting = false;
    }
  }
</script>

{#if variant === 'page'}
  <section class="card auth-shell pairing-confirm">
    {#if kickerKey}
      <p class="auth-kicker">{t(kickerKey)}</p>
    {/if}
    {#if titleKey}
      <h1 class="page-title">{t(titleKey)}</h1>
    {/if}
    {#if leadKey}
      <p class="page-lead">{t(leadKey)}</p>
    {/if}
    {@render formBody()}
  </section>
{:else}
  <div class="pairing-inline">
    {@render formBody()}
  </div>
{/if}

{#snippet formBody()}
  {#if !submitting}
    <form
      class="pairing-form"
      class:pairing-form--inline={variant === 'inline'}
      onsubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <label class="pairing-label" class:pairing-label--inline={variant === 'inline'}>
        {t(codeLabelKey)}
        <input
          class="pairing-input"
          class:pairing-input--inline={variant === 'inline'}
          class:pairing-input--attention={variant === 'inline'}
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="4"
          bind:value={code}
          oninput={(event) => {
            code = normalizeCode(event.currentTarget.value);
          }}
          required
        />
      </label>

      {#if message}
        <p class="pairing-success">{message}</p>
      {/if}
      {#if errorMessage}
        <p class="pairing-error" class:pairing-error--inline={variant === 'inline'}>{errorMessage}</p>
      {/if}

      {#if variant === 'page'}
        <Button type="submit" variant="primary" disabled={normalizeCode(code).length !== 4}>
          {t(submitKey)}
        </Button>
      {:else}
        <button
          type="submit"
          class="pairing-submit-inline"
          disabled={normalizeCode(code).length !== 4}
        >
          {t(submitKey)}
        </button>
      {/if}
    </form>
  {:else}
    <p
      class="pairing-connecting"
      class:pairing-connecting--inline={variant === 'inline'}
      aria-live="polite"
      aria-busy="true"
    >
      <span class="spinner" class:spinner--md={variant === 'page'} aria-hidden="true"></span>
      {t(connectingKey)}
    </p>
  {/if}
{/snippet}

