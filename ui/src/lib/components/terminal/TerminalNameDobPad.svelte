<script lang="ts">
  import TerminalDobNumpad from '$lib/components/terminal/TerminalDobNumpad.svelte';
  import {
    formatDobFromDigits,
    getDobFieldError,
    isDobInputValid,
    type TerminalFieldErrorKey,
  } from '$lib/terminal/terminal-form';
  import {
    appendLastNameChar,
    formatLastNameDisplay,
    getLastNameFieldError,
    isAllowedLastNameChar,
    isLastNameInputValid,
    normalizeLastNameForSubmit,
  } from '$lib/terminal/terminal-last-name-locale';
  import { getTerminalNameKeyboardLayout, getTerminalNameKeyboardMetrics } from '$lib/terminal/terminal-name-keyboard-layout';
  import { locale, t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    disabled?: boolean;
    onSubmit?: (payload: { lastName: string; dobDisplay: string }) => void;
  }

  let { disabled = false, onSubmit }: Props = $props();

  type ActiveField = 'name' | 'dob';

  let activeField = $state<ActiveField>('name');
  let lastNameRaw = $state('');
  let dobDigits = $state('');
  let nameTouched = $state(false);
  let dobTouched = $state(false);
  let submitAttempted = $state(false);

  const lastNameDisplay = $derived(formatLastNameDisplay(lastNameRaw, $locale));
  const dobDisplay = $derived(formatDobFromDigits(dobDigits));
  const dobEmpty = $derived(dobDigits.length === 0);
  const nameErrorKey = $derived(getLastNameFieldError(lastNameRaw));
  const dobErrorKey = $derived(getDobFieldError(dobDigits));
  const showNameError = $derived(nameTouched && nameErrorKey !== null);
  const showDobError = $derived(dobTouched && dobErrorKey !== null);
  const canSubmit = $derived(isLastNameInputValid(lastNameRaw) && isDobInputValid(dobDigits));

  function errorMessage(key: TerminalFieldErrorKey | null): string {
    return key ? t(key) : '';
  }

  function focusField(field: ActiveField) {
    if (activeField === 'name' && field !== 'name') {
      nameTouched = true;
    }
    if (activeField === 'dob' && field !== 'dob') {
      dobTouched = true;
    }
    activeField = field;
  }

  function appendNameChar(char: string) {
    lastNameRaw = appendLastNameChar(lastNameRaw, char, $locale);
  }

  function appendDigit(digit: string) {
    if (!/^\d$/.test(digit) || dobDigits.length >= 8) {
      return;
    }
    dobDigits += digit;
  }

  function backspace() {
    if (activeField === 'name') {
      lastNameRaw = lastNameRaw.slice(0, -1);
      return;
    }
    dobDigits = dobDigits.slice(0, -1);
  }

  function clearActive() {
    if (activeField === 'name') {
      lastNameRaw = '';
      nameTouched = true;
      return;
    }
    dobDigits = '';
    dobTouched = true;
  }

  function submit() {
    submitAttempted = true;
    nameTouched = true;
    dobTouched = true;
    if (!canSubmit || disabled) {
      return;
    }
    onSubmit?.({
      lastName: normalizeLastNameForSubmit(lastNameRaw, $locale),
      dobDisplay,
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (disabled || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (activeField === 'dob' && /^\d$/.test(event.key)) {
      event.preventDefault();
      appendDigit(event.key);
      return;
    }

    if (activeField === 'name' && isAllowedLastNameChar(event.key, $locale)) {
      event.preventDefault();
      appendNameChar(event.key);
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
      focusField(activeField === 'name' ? 'dob' : 'name');
    }
  }
  const nameKeyboardLayout = $derived(getTerminalNameKeyboardLayout($locale));
  const nameKeyboardMetrics = $derived(getTerminalNameKeyboardMetrics(nameKeyboardLayout));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="numpad-screen">
  <div class="numpad-panel">
    <div class="numpad-form">
      <div class="numpad-fields-row">
        <div class="numpad-field-group">
          <label class="field-label" for="terminal-last-name">{t('terminal.nameLabel')}</label>
          <button
            id="terminal-last-name"
            type="button"
            class="numpad-field-display numpad-field-display--text"
            class:is-active={activeField === 'name'}
            class:field-display-empty={lastNameRaw.length === 0}
            class:has-error={showNameError || (submitAttempted && nameErrorKey !== null)}
            aria-describedby={showNameError || (submitAttempted && nameErrorKey) ? 'terminal-name-error' : undefined}
            onclick={() => focusField('name')}
          >
            {lastNameRaw.length === 0 ? t('terminal.namePlaceholder') : lastNameDisplay}
          </button>
          {#if showNameError || (submitAttempted && nameErrorKey)}
            <p id="terminal-name-error" class="numpad-field-error" role="alert">{errorMessage(nameErrorKey)}</p>
          {/if}
        </div>
        <div class="numpad-field-group">
          <label class="field-label" for="terminal-name-dob">{t('terminal.dobLabel')}</label>
          <button
            id="terminal-name-dob"
            type="button"
            class="numpad-field-display"
            class:is-active={activeField === 'dob'}
            class:field-display-empty={dobEmpty}
            class:has-error={showDobError || (submitAttempted && dobErrorKey !== null)}
            aria-describedby={showDobError || (submitAttempted && dobErrorKey) ? 'terminal-name-dob-error' : undefined}
            onclick={() => focusField('dob')}
          >
            {dobEmpty ? t('terminal.dobPlaceholder') : dobDisplay}
          </button>
          {#if showDobError || (submitAttempted && dobErrorKey)}
            <p id="terminal-name-dob-error" class="numpad-field-error" role="alert">{errorMessage(dobErrorKey)}</p>
          {/if}
        </div>
      </div>

      <button type="button" class="numpad-submit" disabled={!canSubmit || disabled} onclick={submit}>
        {t('terminal.numpadContinue')}
      </button>
    </div>

    {#if activeField === 'name'}
      <div
        class="name-keyboard"
        style={`--terminal-name-top-key-count: ${nameKeyboardMetrics.topKeyCount}; --terminal-name-space-key-count: ${nameKeyboardMetrics.spacebarKeyCount}`}
        aria-label={t('terminal.namePadAria')}
      >
        <div class="name-keyboard-row name-keyboard-row--top">
          <button type="button" class="numpad-key numpad-key--clear name-key name-key--utility" disabled={disabled} onclick={clearActive}>
            {t('terminal.numpadDelete')}
          </button>
          {#each nameKeyboardLayout.topRow as key}
            <button type="button" class="numpad-key name-key" disabled={disabled} onclick={() => appendNameChar(key)}>
              {key}
            </button>
          {/each}
          {#if nameKeyboardLayout.topRowTrailingKey}
            <button
              type="button"
              class="numpad-key name-key"
              disabled={disabled}
              onclick={() => appendNameChar(nameKeyboardLayout.topRowTrailingKey!)}
            >
              {nameKeyboardLayout.topRowTrailingKey}
            </button>
          {/if}
          <button
            type="button"
            class="numpad-key numpad-key--back name-key name-key--utility"
            disabled={disabled}
            aria-label={t('terminal.numpadBackspaceAria')}
            onclick={backspace}
          >
            ←
          </button>
        </div>
        {#each nameKeyboardLayout.rows as row}
          <div class="name-keyboard-row">
            {#each row as key}
              <button type="button" class="numpad-key name-key" disabled={disabled} onclick={() => appendNameChar(key)}>
                {key}
              </button>
            {/each}
          </div>
        {/each}
        <div class="name-keyboard-row name-keyboard-row--space">
          {#each Array.from({ length: nameKeyboardMetrics.spacebarLeadingGhostCount }) as _leading}
            <span class="name-key name-key--ghost" aria-hidden="true"></span>
          {/each}
          <button
            type="button"
            class="numpad-key name-key name-key--space"
            disabled={disabled}
            onclick={() => appendNameChar(' ')}
          >
            {t('terminal.nameSpaceKey')}
          </button>
          {#each Array.from({ length: nameKeyboardMetrics.spacebarTrailingGhostCount }) as _trailing}
            <span class="name-key name-key--ghost" aria-hidden="true"></span>
          {/each}
        </div>
      </div>
    {:else}
      <TerminalDobNumpad disabled={disabled} onDigit={appendDigit} onClear={clearActive} onBackspace={backspace} />
    {/if}
  </div>
</div>
