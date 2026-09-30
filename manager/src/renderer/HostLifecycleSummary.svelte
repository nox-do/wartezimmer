<script lang="ts">
  import type { HostLifecycle } from '@praxis-flow/server-shared/setup-api';
  import { hostLifecycleSummary } from './host-lifecycle-view-model.js';

  let { lifecycle }: { lifecycle: HostLifecycle } = $props();
  const summary = $derived(hostLifecycleSummary(lifecycle));
</script>

<section class="mode-card" aria-label="Betriebsmodus">
  <dl class="mode-card-row">
    <dt>Betriebsmodus</dt>
    <dd>{summary.title}</dd>
  </dl>
  {#if summary.operation || summary.preparation || lifecycle.issues.length || summary.recovery || summary.repair}
  <div class="mode-card-notices">
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
  </div>
  {/if}
</section>

<style>
  .mode-card {
    margin-bottom: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .mode-card-row {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 0.75rem;
    align-items: baseline;
    margin: 0;
  }

  .mode-card-row dt {
    color: var(--muted);
    font-size: var(--font-small);
    font-weight: 500;
  }

  .mode-card-row dd {
    margin: 0;
    color: var(--text);
    font-size: var(--font-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .mode-card-notices {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }

  .mode-card-notices p {
    margin: 0;
  }
</style>
