<script lang="ts">
  import { type AppLocale } from '$lib/i18n/core/I18nTypes';
  import {
    filterPatientLanguageOptions,
    resolvePatientLocaleAgainstEnabled,
  } from '$lib/i18n/patient-locale-options';
  import { locale, setLocale, t } from '$lib/i18n/i18nStore.svelte';
  import { warmBrowserTranslator } from '$lib/i18n/browser-translator';
  import { storePatientLocale } from '$lib/i18n/patient-locale';
  import type { TerminalPatientLocale } from '@praxis-flow/domain';
  import { DEFAULT_TERMINAL_PATIENT_LOCALES } from '@praxis-flow/domain';

  let {
    enabledLocales = DEFAULT_TERMINAL_PATIENT_LOCALES,
    placement = 'side',
  }: {
    enabledLocales?: readonly TerminalPatientLocale[];
    /** Terminal: fixed side rail. Portal entry: compact row top-right. */
    placement?: 'side' | 'corner';
  } = $props();

  let switching = $state(false);

  const visibleLanguages = $derived(filterPatientLanguageOptions(enabledLocales));

  $effect(() => {
    const allowed = resolvePatientLocaleAgainstEnabled($locale, enabledLocales);
    if (allowed !== $locale) {
      void setLocale(allowed);
      storePatientLocale(allowed);
    }
  });

  async function selectLocale(next: AppLocale) {
    if (switching || next === $locale || !enabledLocales.includes(next)) {
      return;
    }

    switching = true;
    try {
      await setLocale(next);
      storePatientLocale(next);
    } finally {
      switching = false;
    }

    void warmBrowserTranslator(next);
  }
</script>

<div
  class="lang-picker-wrap"
  class:lang-picker-wrap--side={placement === 'side'}
  class:lang-picker-wrap--corner={placement === 'corner'}
>
  <div
    class="lang-picker"
    class:lang-picker--side={placement === 'side'}
    class:lang-picker--corner={placement === 'corner'}
    role="group"
    aria-label={t('terminal.langPickerAria')}
  >
    {#each visibleLanguages as language (language.locale)}
      <button
        type="button"
        class="lang-picker-btn"
        class:is-active={$locale === language.locale}
        aria-pressed={$locale === language.locale}
        title={t(language.titleKey)}
        disabled={switching}
        onclick={() => void selectLocale(language.locale)}
      >
        <span class="lang-picker-flag" aria-hidden="true">{language.flag}</span>
        <span class="lang-picker-code">{language.code}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .lang-picker-wrap--side,
  .lang-picker-wrap--corner {
    z-index: 50;
    margin: 0;
    pointer-events: none;
  }

  .lang-picker-wrap--side {
    position: fixed;
    right: max(10px, env(safe-area-inset-right));
    top: 50%;
    transform: translateY(-50%);
    max-height: calc(
      100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)
    );
  }

  .lang-picker-wrap--corner {
    position: fixed;
    top: max(8px, env(safe-area-inset-top));
    right: max(8px, env(safe-area-inset-right));
    max-width: min(calc(100vw - 1rem), 18rem);
  }

  .lang-picker-wrap--side .lang-picker,
  .lang-picker-wrap--corner .lang-picker {
    pointer-events: auto;
  }

  .lang-picker {
    display: flex;
    flex-wrap: nowrap;
    gap: 10px;
    padding: 4px 2px 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }

  .lang-picker--side {
    flex-direction: column;
    flex-wrap: nowrap;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 8px 4px;
    gap: 12px;
    max-height: calc(
      100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)
    );
  }

  .lang-picker--corner {
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 4px;
    gap: 6px;
    max-height: none;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }

  .lang-picker-btn {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 4.25rem;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }

  .lang-picker-btn:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .lang-picker-flag {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    border: 3px solid var(--border);
    background: var(--card);
    font-size: 1.65rem;
    line-height: 1;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .lang-picker-btn.is-active .lang-picker-flag {
    border-color: var(--terminal-ink);
    box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--terminal-ink);
  }

  .lang-picker-btn:not(:disabled):hover .lang-picker-flag {
    border-color: var(--terminal-muted);
  }

  .lang-picker-code {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--terminal-subtext);
  }

  .lang-picker-btn.is-active .lang-picker-code {
    color: var(--terminal-ink);
  }

  .lang-picker-wrap--corner .lang-picker-btn {
    min-width: auto;
    gap: 2px;
  }

  .lang-picker-wrap--corner .lang-picker-flag {
    width: 2.125rem;
    height: 2.125rem;
    font-size: 1.1rem;
    border-width: 2px;
  }

  .lang-picker-wrap--corner .lang-picker-code {
    font-size: 0.625rem;
  }
</style>
