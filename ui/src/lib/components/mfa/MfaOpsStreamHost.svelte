<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import TerminalAssistAlert from '$lib/components/mfa/TerminalAssistAlert.svelte';
  import {
    handleMfaBackendRecovered,
    mfaBackendRecoveryEpoch,
  } from '$lib/mfa/mfa-backend-recovery.svelte';
  import { checkInMfaTicket } from '$lib/mfa/mfa-queue-commands.svelte';
  import { mfaQueueActions } from '$lib/mfa/mfa-queue-modals.svelte';
  import { connectOpsStream } from '$lib/mfa/ops-stream';
  import {
    mfaQueueDisplay,
    mountMfaQueueDisplay,
    resetMfaQueueDisplay,
  } from '$lib/mfa/mfa-queue-display.svelte';
  import { startMfaRuntimeResetWatch } from '$lib/mfa/mfa-practice-context.svelte';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  const assistanceItems = $derived(
    (mfaQueueDisplay.queue?.items ?? []).filter((item) => item.terminalAssistancePending),
  );

  onMount(() => {
    resetMfaQueueDisplay();
    const disconnectOpsStream = connectOpsStream();
    const stopRuntimeResetWatch = startMfaRuntimeResetWatch();
    const stopQueueDisplay = mountMfaQueueDisplay({
      onBackendRecovered: handleMfaBackendRecovered,
    });

    return () => {
      disconnectOpsStream();
      stopRuntimeResetWatch();
      stopQueueDisplay();
    };
  });
</script>

{#if assistanceItems.length > 0}
  <div class="mfa-assist-banner">
    <TerminalAssistAlert
      items={assistanceItems}
      busyVisitId={mfaQueueActions.busyVisitId}
      onPickedUp={checkInMfaTicket}
    />
  </div>
{/if}

{#key $mfaBackendRecoveryEpoch}
  {@render children?.()}
{/key}
