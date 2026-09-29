<script lang="ts">
  import type { NetworkBindingCheck } from '../shared/host-status.js';
  let { checks }: { checks: NetworkBindingCheck[] } = $props();
  const failures = $derived(checks.filter((check) => !check.ok));
  const passed = $derived(checks.filter((check) => check.ok));
</script>

{#snippet checkList(items: NetworkBindingCheck[])}
  <ul class="checklist network-bindings-list">
    {#each items as check (check.id)}
      <li class:is-bad={!check.ok}>
        <span aria-hidden="true">{check.ok ? '✓' : '✗'}</span>
        <div>{check.message}
          {#if check.detail}
            <details class="network-check-detail"><summary>Technische Details</summary>{check.detail}</details>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/snippet}

<div id="network-bindings-panel" class="network-checks">
  {#if checks.length === 0}
    <p class="hint">Adresse und Ports wurden noch nicht geprüft.</p>
  {:else}
    {#if failures.length}
      <p class="error">{failures.length} {failures.length === 1 ? 'Abweichung erkannt' : 'Abweichungen erkannt'}</p>
      {@render checkList(failures)}
    {/if}
    {#if passed.length}
      <details>
        <summary>{passed.length} {passed.length === 1 ? 'Prüfung erfolgreich' : 'Prüfungen erfolgreich'}</summary>
        {@render checkList(passed)}
      </details>
    {/if}
  {/if}
</div>
