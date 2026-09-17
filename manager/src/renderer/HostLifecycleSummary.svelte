<script lang="ts">
  import type { HostLifecycle } from '@praxis-flow/server-shared/setup-api';
  import { hostLifecycleSummary } from './host-lifecycle-view-model.js';

  let { lifecycle }: { lifecycle: HostLifecycle } = $props();
  const summary = $derived(hostLifecycleSummary(lifecycle));
</script>

<section class="panel-section" aria-label="Betriebsmodus">
  <h2>Betriebsmodus</h2>
  <p><strong>{summary.title}</strong></p>
  {#if summary.operation}
    <p class="notice is-warn" role="status">{summary.operation}</p>
  {/if}
  {#if summary.preparation}
    <p class="hint">{summary.preparation}</p>
  {/if}
  {#each lifecycle.issues as issue (issue.code)}
    <p class="notice is-warn">{issue.message}</p>
  {/each}
  {#if summary.recovery}
    <p class="notice is-warn">{summary.recovery}</p>
  {/if}
  {#if summary.repair}
    <p class="hint">{summary.repair}</p>
  {/if}
</section>
