<script lang="ts">
  import '$lib/styles/ops.css';
  import AuthGate from '$lib/components/auth/AuthGate.svelte';

  let { children } = $props();
</script>

<div class="staff-page">
  <AuthGate requiredRole="ops" loginHref="/mfa/login?role=ops&redirect=/ops">
    {@render children()}
  </AuthGate>
</div>
