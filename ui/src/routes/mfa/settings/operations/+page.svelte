<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';
  import MfaBooleanSettingToggle from '$lib/components/mfa/MfaBooleanSettingToggle.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import { changeAuthPin, type AuthPinTarget } from '$lib/auth/session-client';
  import { fetchOpsSettings, patchOpsSettings } from '$lib/queue/ops-settings-api';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';
  import {
    isTerminalPatientLocaleEnabled,
    toggleTerminalPatientLocale,
    type TerminalPatientLocale,
  } from '@praxis-flow/domain';

  const RETURN_WINDOW_MIN = 1;
  const RETURN_WINDOW_MAX = 240;

  type AuthToggleKey = 'terminalAuthPhoneEnabled' | 'terminalAuthNameDobEnabled' | 'terminalAuthEgkEnabled';

  type OptionalPatientLocale = Exclude<TerminalPatientLocale, 'de-DE'>;

  const OPTIONAL_LOCALE_META: Record<
    OptionalPatientLocale,
    { labelKey: string }
  > = {
    'en-GB': {
      labelKey: 'mfa.settings.terminalPatientLocaleEnLabel',
    },
    'tr-TR': {
      labelKey: 'mfa.settings.terminalPatientLocaleTrLabel',
    },
    'ru-RU': {
      labelKey: 'mfa.settings.terminalPatientLocaleRuLabel',
    },
    'uk-UA': {
      labelKey: 'mfa.settings.terminalPatientLocaleUkLabel',
    },
  };

  const OPTIONAL_LOCALES = Object.keys(OPTIONAL_LOCALE_META) as OptionalPatientLocale[];

  let loading = $state(true);
  let promoBusy = $state(false);
  let returnWindowBusy = $state(false);
  let authBusyKey = $state<AuthToggleKey | null>(null);
  let localeBusyKey = $state<OptionalPatientLocale | null>(null);
  let terminalWlanPromoEnabled = $state(false);
  let terminalAuthPhoneEnabled = $state(true);
  let terminalAuthNameDobEnabled = $state(false);
  let terminalAuthEgkEnabled = $state(false);
  let terminalPatientLocales = $state<TerminalPatientLocale[]>(['de-DE']);
  let returnWindowMinutes = $state(15);
  let returnWindowDraft = $state('15');
  type MfaPinTarget = Extract<AuthPinTarget, 'mfa' | 'room-panel'>;

  let pinBusyTarget = $state<MfaPinTarget | null>(null);
  let pinDialogTarget = $state<MfaPinTarget | null>(null);
  let pinDialogForm = $state({
    currentPin: '',
    newPin: '',
    confirmNewPin: '',
  });

  async function loadSettings() {
    const settingsResult = await fetchOpsSettings();
    loading = false;

    if (!settingsResult.ok) {
      toastStore.error(settingsResult.error.message || t('mfa.settings.settingsLoadError'));
      return;
    }
    terminalWlanPromoEnabled = settingsResult.data.terminalWlanPromoEnabled;
    terminalAuthPhoneEnabled = settingsResult.data.terminalAuthPhoneEnabled;
    terminalAuthNameDobEnabled = settingsResult.data.terminalAuthNameDobEnabled;
    terminalAuthEgkEnabled = settingsResult.data.terminalAuthEgkEnabled;
    terminalPatientLocales = settingsResult.data.terminalPatientLocales;
    returnWindowMinutes = settingsResult.data.returnWindowMinutes;
    returnWindowDraft = String(returnWindowMinutes);
  }

  async function handleWlanPromoToggle(nextEnabled: boolean) {
    promoBusy = true;
    const result = await patchOpsSettings({ terminalWlanPromoEnabled: nextEnabled });
    promoBusy = false;

    if (!result.ok) {
      toastStore.error(result.error.message || t('mfa.settings.settingsSaveError'));
      return;
    }

    terminalWlanPromoEnabled = result.data.terminalWlanPromoEnabled;
    toastStore.success(
      nextEnabled ? t('mfa.settings.terminalWlanPromoOnToast') : t('mfa.settings.terminalWlanPromoOffToast'),
    );
  }

  async function handleAuthToggle(key: AuthToggleKey, nextEnabled: boolean) {
    authBusyKey = key;
    const result = await patchOpsSettings({ [key]: nextEnabled });
    authBusyKey = null;

    if (!result.ok) {
      toastStore.error(result.error.message || t('mfa.settings.settingsSaveError'));
      return;
    }

    terminalAuthPhoneEnabled = result.data.terminalAuthPhoneEnabled;
    terminalAuthNameDobEnabled = result.data.terminalAuthNameDobEnabled;
    terminalAuthEgkEnabled = result.data.terminalAuthEgkEnabled;

    const toastKey =
      key === 'terminalAuthPhoneEnabled'
        ? nextEnabled
          ? 'terminalAuthPhoneOnToast'
          : 'terminalAuthPhoneOffToast'
        : key === 'terminalAuthNameDobEnabled'
          ? nextEnabled
            ? 'terminalAuthNameDobOnToast'
            : 'terminalAuthNameDobOffToast'
          : nextEnabled
            ? 'terminalAuthEgkOnToast'
            : 'terminalAuthEgkOffToast';
    toastStore.success(t(`mfa.settings.${toastKey}`));
  }

  async function handlePatientLocaleToggle(locale: OptionalPatientLocale, nextEnabled: boolean) {
    localeBusyKey = locale;
    const nextLocales = toggleTerminalPatientLocale(terminalPatientLocales, locale, nextEnabled);
    const result = await patchOpsSettings({ terminalPatientLocales: nextLocales });
    localeBusyKey = null;

    if (!result.ok) {
      toastStore.error(result.error.message || t('mfa.settings.settingsSaveError'));
      return;
    }

    terminalPatientLocales = result.data.terminalPatientLocales;
    toastStore.success(t('mfa.settings.terminalPatientLocalesSaved'));
  }

  function parseReturnWindowDraft(): number | null {
    const raw = String(returnWindowDraft ?? '').trim();
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < RETURN_WINDOW_MIN || parsed > RETURN_WINDOW_MAX) {
      return null;
    }
    return parsed;
  }

  async function saveReturnWindowMinutes() {
    if (returnWindowBusy) {
      return;
    }

    const parsed = parseReturnWindowDraft();
    if (parsed == null) {
      toastStore.error(t('mfa.settings.returnWindowInvalid'));
      returnWindowDraft = String(returnWindowMinutes);
      return;
    }
    if (parsed === returnWindowMinutes) {
      return;
    }

    returnWindowBusy = true;
    try {
      const result = await patchOpsSettings({ returnWindowMinutes: parsed });
      if (!result.ok) {
        toastStore.error(result.error.message || t('mfa.settings.settingsSaveError'));
        returnWindowDraft = String(returnWindowMinutes);
        return;
      }

      returnWindowMinutes = result.data.returnWindowMinutes;
      returnWindowDraft = String(returnWindowMinutes);
      toastStore.success(t('mfa.settings.returnWindowSaved'));
    } finally {
      returnWindowBusy = false;
    }
  }

  function openPinDialog(target: MfaPinTarget) {
    if (pinBusyTarget != null) {
      return;
    }
    pinDialogTarget = target;
    pinDialogForm = { currentPin: '', newPin: '', confirmNewPin: '' };
  }

  function resetPinDialog() {
    pinDialogTarget = null;
    pinDialogForm = { currentPin: '', newPin: '', confirmNewPin: '' };
  }

  function closePinDialog() {
    if (pinBusyTarget != null) {
      return;
    }
    resetPinDialog();
  }

  async function handlePinChange(target: MfaPinTarget, currentPin: string, newPin: string) {
    if (pinBusyTarget || currentPin.length < 4 || newPin.length < 4) {
      toastStore.error(t('mfa.settings.pinChangeInvalid'));
      return;
    }

    pinBusyTarget = target;
    try {
      const result = await changeAuthPin({
        target,
        currentPin,
        newPin,
        role: 'mfa',
      });
      if (!result.ok) {
        toastStore.error(
          result.error.status === 401
            ? t('mfa.settings.pinChangeCurrentInvalid')
            : result.error.message || t('mfa.settings.settingsSaveError'),
        );
        return;
      }

      resetPinDialog();
      const savedKey =
        target === 'mfa' ? 'mfa.settings.pinChangeMfaSaved' : 'mfa.settings.pinChangePanelSaved';
      toastStore.success(t(savedKey));
    } finally {
      pinBusyTarget = null;
    }
  }

  async function submitPinDialog() {
    if (!pinDialogTarget) {
      return;
    }
    const currentPin = pinDialogForm.currentPin.trim();
    const newPin = pinDialogForm.newPin.trim();
    const confirmNewPin = pinDialogForm.confirmNewPin.trim();
    const pinPattern = /^\d{4,}$/;
    if (!pinPattern.test(currentPin) || !pinPattern.test(newPin) || !pinPattern.test(confirmNewPin)) {
      toastStore.error(t('mfa.settings.pinChangeInvalid'));
      return;
    }
    if (newPin !== confirmNewPin) {
      toastStore.error(t('mfa.settings.pinRepeatMismatch'));
      return;
    }
    await handlePinChange(pinDialogTarget, currentPin, newPin);
  }

  onMount(() => {
    void loadSettings();
  });
</script>

<StaffSettingsShell title={t('mfa.settings.betriebTitle')} lead={t('mfa.settings.betriebLead')}>
{#if loading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else}
  <div class="panel">
    <h2 class="panel__title">{t('mfa.settings.returnWindowPanelTitle')}</h2>
      <p class="text-desc">{t('mfa.settings.returnWindowPanelDesc')}</p>
      <label class="modal-form-field modal-form-field--narrow">
        {t('mfa.settings.returnWindowLabel')}
        <input
          class="form-input"
          type="number"
          min={RETURN_WINDOW_MIN}
          max={RETURN_WINDOW_MAX}
          step="1"
          inputmode="numeric"
          bind:value={returnWindowDraft}
          disabled={returnWindowBusy}
          onchange={() => void saveReturnWindowMinutes()}
        />
        <span class="field-hint">{t('mfa.settings.returnWindowHint')}</span>
      </label>
    </div>

  <div class="panel">
    <h2 class="panel__title">{t('mfa.settings.pinSecurityPanelTitle')}</h2>
      <p class="text-desc">{t('mfa.settings.pinSecurityPanelDesc')}</p>
      <div class="pin-change-actions">
        <div class="pin-change-card">
          <h3>{t('mfa.settings.pinNewMfaLabel')}</h3>
          <Button
            type="button"
            variant="outline"
            loading={pinBusyTarget === 'mfa'}
            disabled={pinBusyTarget != null}
            onclick={() => openPinDialog('mfa')}
          >
            {t('mfa.settings.pinChangeMfaSubmit')}
          </Button>
        </div>

        <div class="pin-change-card">
          <h3>{t('mfa.settings.pinNewPanelLabel')}</h3>
          <Button
            type="button"
            variant="outline"
            loading={pinBusyTarget === 'room-panel'}
            disabled={pinBusyTarget != null}
            onclick={() => openPinDialog('room-panel')}
          >
            {t('mfa.settings.pinChangePanelSubmit')}
          </Button>
        </div>
      </div>
    </div>

  <div class="panel">
    <h2 class="panel__title">{t('mfa.settings.terminalAuthPanelTitle')}</h2>
      <p class="text-desc">{t('mfa.settings.terminalAuthPanelDesc')}</p>
      <MfaBooleanSettingToggle
        label={t('mfa.settings.terminalAuthPhoneLabel')}
        checked={terminalAuthPhoneEnabled}
        busy={authBusyKey === 'terminalAuthPhoneEnabled'}
        onChange={(next) => void handleAuthToggle('terminalAuthPhoneEnabled', next)}
      />
      <MfaBooleanSettingToggle
        label={t('mfa.settings.terminalAuthNameDobLabel')}
        checked={terminalAuthNameDobEnabled}
        busy={authBusyKey === 'terminalAuthNameDobEnabled'}
        onChange={(next) => void handleAuthToggle('terminalAuthNameDobEnabled', next)}
      />
      <!-- eGK: UI vorbereitet, Terminal-Flow noch nicht implementiert — Toggle bis dahin gesperrt. -->
      <MfaBooleanSettingToggle
        label={t('mfa.settings.terminalAuthEgkLabel')}
        description={t('mfa.settings.terminalAuthEgkDesc')}
        checked={terminalAuthEgkEnabled}
        disabled={true}
        busy={false}
        onChange={() => {}}
      />
    </div>

  <div class="panel">
    <h2 class="panel__title">{t('mfa.settings.terminalPatientLocalesPanelTitle')}</h2>
      <p class="text-desc">{t('mfa.settings.terminalPatientLocalesPanelDesc')}</p>
      <MfaBooleanSettingToggle
        label={t('mfa.settings.terminalPatientLocaleDeLabel')}
        checked={true}
        disabled={true}
        busy={false}
        onChange={() => {}}
      />
      {#each OPTIONAL_LOCALES as locale (locale)}
        {@const meta = OPTIONAL_LOCALE_META[locale]}
        <MfaBooleanSettingToggle
          label={t(meta.labelKey)}
          checked={isTerminalPatientLocaleEnabled(terminalPatientLocales, locale)}
          busy={localeBusyKey === locale}
          onChange={(next) => void handlePatientLocaleToggle(locale, next)}
        />
      {/each}
    </div>

  <div class="panel">
    <h2 class="panel__title">{t('mfa.settings.terminalWlanPromoPanelTitle')}</h2>
      <p class="text-desc">{t('mfa.settings.terminalWlanPromoPanelDesc')}</p>
      <MfaBooleanSettingToggle
        label={t('mfa.settings.terminalWlanPromoLabel')}
        description={t('mfa.settings.terminalWlanPromoDesc')}
        checked={terminalWlanPromoEnabled}
        busy={promoBusy}
        onChange={(next) => void handleWlanPromoToggle(next)}
      />
  </div>
{/if}
</StaffSettingsShell>

<Modal
  open={pinDialogTarget != null}
  title={
    pinDialogTarget === 'mfa'
      ? t('mfa.settings.pinChangeMfaSubmit')
      : pinDialogTarget === 'room-panel'
        ? t('mfa.settings.pinChangePanelSubmit')
        : t('mfa.settings.pinSecurityPanelTitle')
  }
  headerClass="modal-header--hero bg-gradient-primary"
  maxWidth="520px"
  dimBackdrop={true}
  closeOnEscape={pinBusyTarget == null}
  showCloseButton={pinBusyTarget == null}
  onClose={closePinDialog}
>
  <form
    class="modal-form"
    onsubmit={(event) => {
      event.preventDefault();
      void submitPinDialog();
    }}
  >
    <label class="modal-form-field">
      <span>{t('mfa.settings.pinCurrentLabel')}</span>
      <input
        class="form-input"
        type="password"
        inputmode="numeric"
        autocomplete="current-password"
        bind:value={pinDialogForm.currentPin}
        required
        minlength="4"
        pattern={'[0-9]{4,}'}
        disabled={pinBusyTarget != null}
      />
    </label>

    <label class="modal-form-field">
      <span>
        {pinDialogTarget === 'room-panel'
          ? t('mfa.settings.pinNewPanelLabel')
          : t('mfa.settings.pinNewMfaLabel')}
      </span>
      <input
        class="form-input"
        type="password"
        inputmode="numeric"
        autocomplete="new-password"
        bind:value={pinDialogForm.newPin}
        required
        minlength="4"
        pattern={'[0-9]{4,}'}
        disabled={pinBusyTarget != null}
      />
    </label>

    <label class="modal-form-field">
      <span>{t('mfa.settings.pinRepeatLabel')}</span>
      <input
        class="form-input"
        type="password"
        inputmode="numeric"
        autocomplete="new-password"
        bind:value={pinDialogForm.confirmNewPin}
        required
        minlength="4"
        pattern={'[0-9]{4,}'}
        disabled={pinBusyTarget != null}
      />
    </label>

    <div class="form-actions">
      <Button type="button" variant="outline" disabled={pinBusyTarget != null} onclick={closePinDialog}>
        {t('ui.cancel')}
      </Button>
      <Button type="submit" variant="primary" loading={pinBusyTarget != null} disabled={pinBusyTarget != null}>
        {pinDialogTarget === 'room-panel'
          ? t('mfa.settings.pinChangePanelSubmit')
          : t('mfa.settings.pinChangeMfaSubmit')}
      </Button>
    </div>
  </form>
</Modal>

<style>
  .pin-change-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 1rem;
  }

  .pin-change-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 0.875rem;
    background: color-mix(in oklab, var(--card) 90%, var(--background));
  }

  .pin-change-card h3 {
    margin: 0;
    font-size: 1rem;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
</style>
