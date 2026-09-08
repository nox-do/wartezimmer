<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { Users } from '@lucide/svelte';
  import { formatTicketCode } from '@praxis-flow/domain';
  import MfaActionButton from '$lib/components/mfa/MfaActionButton.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { playAssistanceChime, unlockAssistanceChime } from '$lib/mfa/assistance-chime';
  import type { QueueItem } from '$lib/queue/types';

  interface Props {
    items: QueueItem[];
    busyVisitId?: string | null;
    onPickedUp: (visitId: string) => void;
  }

  let { items, busyVisitId = null, onPickedUp }: Props = $props();
  const announcedVisitIds = new SvelteSet<string>();

  onMount(() => {
    void unlockAssistanceChime();
    const unlockOnInteraction = () => {
      void unlockAssistanceChime();
    };
    document.addEventListener('pointerdown', unlockOnInteraction, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', unlockOnInteraction);
    };
  });

  $effect(() => {
    const newItems = items.filter((item) => !announcedVisitIds.has(item.visitId));
    if (newItems.length === 0) {
      return;
    }

    newItems.forEach((item) => announcedVisitIds.add(item.visitId));
    playAssistanceChime();
  });
</script>

{#if items.length > 0}
  <div class="alert alert--assist" role="alert">
    <div>
      <strong>{t('mfa.assistTitle')}</strong>
      {#each items as item (item.visitId)}
        <div class="alert__assist-row">
          <p>
            {tf('mfa.assistLine', {
              ticket: formatTicketCode(item.laneCode, item.number),
            })}
          </p>
          <MfaActionButton
            disabled={busyVisitId === item.visitId}
            ariaLabel={tf('mfa.assistPickedUpAria', {
              ticket: formatTicketCode(item.laneCode, item.number),
            })}
            onclick={() => onPickedUp(item.visitId)}
          >
            {busyVisitId === item.visitId ? t('mfa.assistPickedUpBusy') : t('mfa.assistPickedUp')}
          </MfaActionButton>
        </div>
      {/each}
    </div>
    <Users size={22} aria-hidden="true" class="alert__assist-icon" />
  </div>
{/if}
