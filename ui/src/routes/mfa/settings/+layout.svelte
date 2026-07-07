<script lang="ts">
  import '$lib/styles/mfa-settings.css';
  import MfaSettingsLayout from '$lib/components/mfa/MfaSettingsLayout.svelte';

  let { children } = $props();
</script>

<MfaSettingsLayout>
  {@render children()}
</MfaSettingsLayout>
