<script lang="ts">
  import FormField from '$lib/components/forms/FormField.svelte';
  import { onDestroy, onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import Button from '$lib/components/forms/Button.svelte';
  import {
    getPracticeProfileFallback,
    mountPracticeProfileSync,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import ProductMark from '$lib/components/shared/ProductMark.svelte';
  import { staffAuthSlots, submitAuthLogin, submitAuthPinSetup, submitAuthLogout, loadAuthSession, shouldLoadAuthSession } from '$lib/auth/session-state.svelte';

  let practiceProfile = $state(getPracticeProfileFallback());
  const practiceName = $derived(practiceDisplayLabel(practiceProfile, t('terminal.practiceFallback')));

  let pin = $state('');
  let pinInput: HTMLInputElement | null = $state(null);
  let submitting = $state(false);
  let formError = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let newPin = $state('');
  let confirmPin = $state('');
  let viewVersion = 0;

  onDestroy(() => { viewVersion += 1; });

  const loginRole = $derived(page.url.searchParams.get('role') === 'ops' ? 'ops' : 'mfa');
  const redirectTarget = $derived(resolveRedirectTarget(page.url.searchParams.get('redirect'), loginRole));
  const loginLead = $derived(loginRole === 'ops' ? t('auth.loginLeadOps') : t('auth.loginLeadMfa'));

  function resolveRedirectTarget(candidate: string | null, role: 'mfa' | 'ops'): string {
    if (candidate?.startsWith('/') && !candidate.startsWith('//')) {
      return candidate;
    }
    return role === 'ops' ? '/ops' : '/mfa';
  }

  const authSlot = $derived(staffAuthSlots[loginRole]);

  const pinChangeRequired = $derived(
    authSlot.status === 'authenticated' && authSlot.user?.pinChangeRequired === true,
  );

  $effect(() => {
    if (shouldLoadAuthSession(loginRole)) void loadAuthSession(loginRole);
  });

  $effect(() => {
    // Never carry credentials across the MFA/Ops role switch.
    void loginRole;
    viewVersion += 1;
    submitting = false;
    pin = '';
    newPin = '';
    confirmPin = '';
    formError = null;
    successMessage = null;
  });

  $effect(() => {
    if (
      authSlot.status === 'authenticated' &&
      authSlot.user?.role === loginRole &&
      !authSlot.user.pinChangeRequired
    ) {
      void gotoResolved(redirectTarget);
    }
  });

  onMount(() => {
    void tick().then(() => pinInput?.focus());
    return mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });
  });

  async function handleSubmit() {
    const version = viewVersion;
    const role = loginRole;
    formError = null;
    successMessage = null;
    submitting = true;
    let retryPin = false;
    try {
      const ok = await submitAuthLogin({
        pin,
        role,
      });
      if (version !== viewVersion) return;

      if (!ok) {
        formError = authSlot.errorMessage ?? t('auth.loginFailed');
        pin = '';
        retryPin = true;
        return;
      }

      if (!authSlot.user?.pinChangeRequired) {
        pin = '';
        await gotoResolved(redirectTarget);
      }
    } finally {
      if (version === viewVersion) {
        submitting = false;
        if (retryPin) {
          await tick();
          if (version === viewVersion) pinInput?.focus();
        }
      }
    }
  }
  async function handlePinChange() {
    const version = viewVersion;
    const role = loginRole;
    const sessionId = authSlot.user?.id;
    formError = null;
    if (!/^[0-9]{4,32}$/.test(newPin) || newPin === '0000') {
      formError = t('auth.pinSetupInvalid');
      return;
    }
    if (newPin !== confirmPin) {
      formError = t('auth.pinSetupMismatch');
      return;
    }
    submitting = true;
    try {
      const result = await submitAuthPinSetup({
        currentPin: pin, newPin, role,
      });
      if (version !== viewVersion) return;
      if (authSlot.user && authSlot.user.id !== sessionId) return;
      if (!result.ok) {
        formError = result.error.status === 400
          ? result.error.code === 'AUTH_PIN_DEFAULT_FORBIDDEN'
            ? t('auth.pinSetupInvalid')
            : result.error.message.includes('must be different')
              ? t('auth.pinSetupDifferent')
              : t('auth.pinSetupCurrentInvalid')
          : result.error.message;
        return;
      }
      pin = '';
      newPin = '';
      confirmPin = '';
      if (role === 'ops') {
        successMessage = t('auth.pinSetupOpsSaved');
        await tick();
        if (version === viewVersion) pinInput?.focus();
      }
    } finally {
      if (version === viewVersion) submitting = false;
    }
  }

  async function handleLogout() {
    const version = viewVersion;
    const role = loginRole;
    const sessionId = authSlot.user?.id;
    submitting = true;
    try {
      const result = await submitAuthLogout(role);
      if (version !== viewVersion) return;
      if (authSlot.user && authSlot.user.id !== sessionId) return;
      if (!result.ok) {
        formError = result.error.message;
        return;
      }
      pin = '';
      newPin = '';
      confirmPin = '';
      formError = null;
    } finally {
      if (version === viewVersion) submitting = false;
    }
  }
</script>

<section class="card auth-shell">
  <p class="auth-kicker"><ProductMark />{t('auth.kicker')}</p>
  <h1 class="page-title">{practiceName}</h1>
  <p class="page-lead">{pinChangeRequired ? t('auth.pinSetupTitle') : loginLead}</p>
  <p class="field-hint">{pinChangeRequired ? t('auth.pinSetupHint') : t('auth.loginPinHint')}</p>
  {#if successMessage}<p role="status">{successMessage}</p>{/if}

  <form class="auth-form" onsubmit={(event) => { event.preventDefault(); void (pinChangeRequired ? handlePinChange() : handleSubmit()); }}>
    <FormField label={pinChangeRequired ? t('auth.pinSetupCurrent') : t('auth.pinLabel')}>
      {#snippet children(field)}
        <input
          {...field}
          bind:this={pinInput}
          class="form-input"
          type="password"
          inputmode="numeric"
          autocomplete="current-password"
          spellcheck="false"
          autocapitalize="off"
          aria-invalid={formError ? 'true' : undefined}
          aria-describedby={formError ? 'auth-login-error' : undefined}
          bind:value={pin}
          onfocus={(event) => event.currentTarget.select()}
          disabled={submitting}
          required
        />
      {/snippet}
    </FormField>

    {#if pinChangeRequired}
      <FormField label={t('auth.pinSetupNew')}>
        {#snippet children(field)}
          <input {...field} class="form-input" type="password" inputmode="numeric"
            autocomplete="new-password" bind:value={newPin} required minlength="4"
            maxlength="32" pattern={'[0-9]{4,32}'} disabled={submitting} />
        {/snippet}
      </FormField>
      <FormField label={t('auth.pinSetupRepeat')}>
        {#snippet children(field)}
          <input {...field} class="form-input" type="password" inputmode="numeric"
            autocomplete="new-password" bind:value={confirmPin} required minlength="4"
            maxlength="32" pattern={'[0-9]{4,32}'} disabled={submitting} />
        {/snippet}
      </FormField>
    {/if}

    {#if formError}
      <p id="auth-login-error" class="auth-error" role="alert">{formError}</p>
    {/if}

    <Button type="submit" variant="primary" fullWidth loading={submitting}>
      {pinChangeRequired ? t('auth.pinSetupSubmit') : submitting ? t('auth.loginSubmitting') : t('auth.loginSubmit')}
    </Button>
    {#if pinChangeRequired}
      <Button type="button" variant="outline" disabled={submitting} onclick={() => void handleLogout()}>
        {t('auth.logout')}
      </Button>
    {/if}
  </form>
</section>
