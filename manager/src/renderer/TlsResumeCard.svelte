<script lang="ts">
  import type { TlsStatus } from '../shared/host-status.js';
  import { tlsResumeCard } from './tls-network-view-model.js';

  let {
    tls,
    onResume,
  }: {
    tls: TlsStatus | undefined;
    onResume: () => void;
  } = $props();

  const card = $derived(tlsResumeCard(tls));
</script>

{#if card}
  <section class="setup-entry">
    <p class="setup-entry-eyebrow">HTTPS</p>
    <h2 class="network-config-subheading">{card.title}</h2>
    <p class="setup-entry-copy">{card.copy}</p>
    <button type="button" class="setup-entry-start" onclick={onResume}>{card.button}</button>
  </section>
{/if}
