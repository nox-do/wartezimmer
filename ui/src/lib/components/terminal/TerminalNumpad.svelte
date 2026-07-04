<script lang="ts">
  import TerminalDobNumpad from '$lib/components/terminal/TerminalDobNumpad.svelte';
  import {
    appendPhoneSuffixDigit,
    formatDobFromDigits,
    formatPhoneDisplay,
    getDobFieldError,
    getPhoneFieldError,
    isDobInputValid,
    isPhoneInputValid,
    PHONE_PREFIX,
    type TerminalFieldErrorKey,
  } from '$lib/terminal/terminal-form';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    disabled?: boolean;
    onSubmit?: (payload: { phoneNumber: string; dobDisplay: string }) => void;
  }

  let { disabled = false, onSubmit }: Props = $props();

  type ActiveField = 'phone' | 'dob';
  let activeField = $state<ActiveField>('phone');
  let phoneSuffix = $state('');
  let dobDigits = $state('');
  let phoneTouched = $state(false);
  let dobTouched = $state(false);
  let submitAttempted = $state(false);

  const phoneDisplay = $derived(formatPhoneDisplay(PHONE_PREFIX, phoneSuffix));
  const dobDisplay = $derived(formatDobFromDigits(dobDigits));
  const dobEmpty = $derived(dobDigits.length === 0);
  const phoneErrorKey = $derived(getPhoneFieldError(phoneSuffix));
  const dobErrorKey = $derived(getDobFieldError(dobDigits));
  const showPhoneError = $derived(phoneTouched && phoneErrorKey !== null);
  const showDobError = $derived(dobTouched && dobErrorKey !== null);
  const canSubmit = $derived(isPhoneInputValid(PHONE_PREFIX, phoneSuffix) && isDobInputValid(dobDigits));

  function errorMessage(key: TerminalFieldErrorKey | null): string {
    return key ? t(key) : '';
  }

  function focusField(field: ActiveField) {
    if (activeField === 'phone' && field !== 'phone') {
      phoneTouched = true;
    }
    if (activeField === 'dob' && field !== 'dob') {
      dobTouched = true;
    }
    activeField = field;
  }

  function appendDigit(digit: string) {
    if (activeField === 'phone') {
      phoneSuffix = appendPhoneSuffixDigit(phoneSuffix, digit);
      return;
    }
    if (!/^\d$/.test(digit) || dobDigits.length >= 8) {
      return;
    }
    dobDigits += digit;
  }

  function backspace() {
    if (activeField === 'phone') {
      phoneSuffix = phoneSuffix.slice(0, -1);
      return;
    }
    dobDigits = dobDigits.slice(0, -1);
  }

  function clearActive() {
    if (activeField === 'phone') {
      phoneSuffix = '';
      phoneTouched = true;
      return;
    }
    dobDigits = '';
    dobTouched = true;
  }

  function submit() {
    submitAttempted = true;
    phoneTouched = true;
    dobTouched = true;
    if (!canSubmit || disabled) {
      return;
    }
    onSubmit?.({
      phoneNumber: `${PHONE_PREFIX}${phoneSuffix}`.replace(/\s+/g, ''),
      dobDisplay,
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (disabled || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      appendDigit(event.key);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      backspace();
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      clearActive();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      focusField(activeField === 'phone' ? 'dob' : 'phone');
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="numpad-screen">
  <div class="numpad-panel">
    <div class="numpad-form">
      <div class="numpad-fields-row">
        <div class="numpad-field-group">
          <label class="field-label" for="terminal-phone">{t('terminal.phoneLabel')}</label>
          <button
            id="terminal-phone"
            type="button"
            class="numpad-field-display"
            class:is-active={activeField === 'phone'}
            class:has-error={showPhoneError || (submitAttempted && phoneErrorKey !== null)}
            aria-describedby={showPhoneError || (submitAttempted && phoneErrorKey) ? 'terminal-phone-error' : undefined}
            onclick={() => focusField('phone')}
          >
            {phoneDisplay}
          </button>
          {#if showPhoneError || (submitAttempted && phoneErrorKey)}
            <p id="terminal-phone-error" class="numpad-field-error" role="alert">{errorMessage(phoneErrorKey)}</p>
          {/if}
        </div>
        <div class="numpad-field-group">
          <label class="field-label" for="terminal-dob">{t('terminal.dobLabel')}</label>
          <button
            id="terminal-dob"
            type="button"
            class="numpad-field-display"
            class:is-active={activeField === 'dob'}
            class:field-display-empty={dobEmpty}
            class:has-error={showDobError || (submitAttempted && dobErrorKey !== null)}
            aria-describedby={showDobError || (submitAttempted && dobErrorKey) ? 'terminal-dob-error' : undefined}
            onclick={() => focusField('dob')}
          >
            {dobEmpty ? t('terminal.dobPlaceholder') : dobDisplay}
          </button>
          {#if showDobError || (submitAttempted && dobErrorKey)}
            <p id="terminal-dob-error" class="numpad-field-error" role="alert">{errorMessage(dobErrorKey)}</p>
          {/if}
        </div>
      </div>

      <button type="button" class="numpad-submit" disabled={!canSubmit || disabled} onclick={submit}>
        {t('terminal.numpadContinue')}
      </button>
    </div>

    <TerminalDobNumpad disabled={disabled} onDigit={appendDigit} onClear={clearActive} onBackspace={backspace} />
  </div>
</div>
