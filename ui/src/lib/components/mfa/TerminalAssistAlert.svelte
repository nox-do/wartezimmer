<script lang="ts">
  import { Users } from '@lucide/svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { formatClockTime } from '$lib/queue/format-time';

  export type TerminalAssistPendingView = {
    deviceId: string;
    deviceLabel: string;
    pressedAt: string;
    expiresAt: string;
    remainingMs: number;
  };

  interface Props {
    items: TerminalAssistPendingView[];
    nowMs?: number;
  }

  let { items, nowMs = Date.now() }: Props = $props();

  const visibleItems = $derived(
    items.filter((item) => {
      const expiresMs = Date.parse(item.expiresAt);
      return !Number.isNaN(expiresMs) && expiresMs > nowMs;
    }),
  );
</script>

{#if visibleItems.length > 0}
  <div class="alert alert--assist" role="status">
    <div>
      <strong>{t('mfa.assistTitle')}</strong>
      {#each visibleItems as item (item.deviceId)}
        <p>
          {tf('mfa.assistLine', {
            device: item.deviceLabel,
            time: formatClockTime(item.pressedAt),
            seconds: Math.max(1, Math.ceil(item.remainingMs / 1000)),
          })}
        </p>
      {/each}
    </div>
    <Users size={22} aria-hidden="true" class="alert__assist-icon" />
  </div>
{/if}
