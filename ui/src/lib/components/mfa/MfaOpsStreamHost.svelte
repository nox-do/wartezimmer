<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import EmergencyAlert from '$lib/components/mfa/EmergencyAlert.svelte';
  import { connectOpsStream } from '$lib/mfa/ops-stream';
  import { clearMfaEmergency, mfaEmergency, mountMfaEmergency } from '$lib/mfa/mfa-emergency.svelte';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  onMount(() => {
    const disconnectOpsStream = connectOpsStream();
    const stopEmergency = mountMfaEmergency();

    return () => {
      disconnectOpsStream();
      stopEmergency();
    };
  });
</script>

{#if mfaEmergency.active}
  <div class="mfa-emergency-banner">
    <EmergencyAlert
      emergencyId={mfaEmergency.active.emergencyId}
      raisedAt={mfaEmergency.active.raisedAt}
      onAcknowledged={clearMfaEmergency}
    />
  </div>
{/if}

{@render children?.()}

