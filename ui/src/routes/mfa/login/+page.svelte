<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import Button from '$lib/components/forms/Button.svelte';
  import {
    getPracticeProfileFallback,
    mountPracticeProfileSync,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { staffAuthSlots, submitAuthLogin } from '$lib/auth/session-state.svelte';

  let practiceProfile = $state(getPracticeProfileFallback());
  const practiceName = $derived(practiceDisplayLabel(practiceProfile, t('terminal.practiceFallback')));

  let pin = $state('');
  let submitting = $state(false);
  let formError = $state<string | null>(null);

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

  $effect(() => {
    if (
      authSlot.status === 'authenticated' &&
      authSlot.user?.role === loginRole
    ) {
      void gotoResolved(redirectTarget);
    }
  });

  onMount(() => {
    return mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });
  });

  async function handleSubmit() {
    formError = null;
    submitting = true;
    try {
      const ok = await submitAuthLogin({
        pin,
        role: loginRole,
      });

      if (!ok) {
        formError = authSlot.errorMessage ?? t('auth.loginFailed');
        return;
      }

      await gotoResolved(redirectTarget);
    } finally {
      submitting = false;
    }
  }
</script>

<section class="card auth-shell">
  <p class="auth-kicker">{t('auth.kicker')}</p>
  <h1 class="page-title">{practiceName}</h1>
  <p class="page-lead">{loginLead}</p>
  <p class="field-hint">{t('auth.loginPinHint')}</p>

  <form class="auth-form" onsubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
    <label class="modal-form-field">
      {t('auth.pinLabel')}
      <input
        class="form-input"
        type="password"
        inputmode="numeric"
        autocomplete="current-password"
        bind:value={pin}
        required
      />
    </label>

    {#if formError}
      <p class="auth-error">{formError}</p>
    {/if}

    <Button type="submit" variant="primary" fullWidth loading={submitting}>
      {submitting ? t('auth.loginSubmitting') : t('auth.loginSubmit')}
    </Button>
  </form>
</section>
