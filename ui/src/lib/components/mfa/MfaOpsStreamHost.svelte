<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import EmergencyAlert from '$lib/components/mfa/EmergencyAlert.svelte';
  import TerminalAssistAlert from '$lib/components/mfa/TerminalAssistAlert.svelte';
  import { connectOpsStream } from '$lib/mfa/ops-stream';
  import { clearMfaEmergency, mfaEmergency, mountMfaEmergency } from '$lib/mfa/mfa-emergency.svelte';
  import { mfaQueueDisplay, mountMfaQueueDisplay } from '$lib/mfa/mfa-queue-display.svelte';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  onMount(() => {
    const disconnectOpsStream = connectOpsStream();
    const stopEmergency = mountMfaEmergency();
    const stopQueueDisplay = mountMfaQueueDisplay();

    return () => {
      disconnectOpsStream();
      stopEmergency();
      stopQueueDisplay();
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

{#if mfaQueueDisplay.assistPending.length > 0}
  <div class="mfa-assist-banner">
    <TerminalAssistAlert items={mfaQueueDisplay.assistPending} nowMs={mfaQueueDisplay.countdownNowMs} />
  </div>
{/if}

{@render children?.()}

