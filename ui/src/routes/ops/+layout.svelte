<script lang="ts">
  import '$lib/styles/ops.css';
  import '$lib/styles/staff-settings-layout.css';
  import { page } from '$app/state';
  import AuthGate from '$lib/components/auth/AuthGate.svelte';
  import StaffSettingsLayout from '$lib/components/shared/StaffSettingsLayout.svelte';
  import { OPS_SETTINGS_FOOTER, OPS_SETTINGS_NAV } from '$lib/ops/settings-nav';

  let { children } = $props();

  const isSetup = $derived(page.url.pathname.startsWith('/ops/setup'));
</script>

<div class="staff-page">
  <AuthGate requiredRole="ops" loginHref="/mfa/login?role=ops">
    {#if isSetup}
      {@render children()}
    {:else}
      <StaffSettingsLayout
        subtitleKey="ops.hubTitle"
        backHref="/"
        backLabelKey="ops.nav.back"
        nav={OPS_SETTINGS_NAV}
        footer={OPS_SETTINGS_FOOTER}
      >
        {@render children()}
      </StaffSettingsLayout>
    {/if}
  </AuthGate>
</div>
