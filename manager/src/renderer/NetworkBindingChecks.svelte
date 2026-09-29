<script lang="ts">
  import type { NetworkBindingCheck } from '../shared/host-status.js';

  let { checks }: { checks: NetworkBindingCheck[] } = $props();
</script>

{#if checks.length === 0}
  <p class="hint">Die Bindung von Adresse und Ports wurde noch nicht geprüft.</p>
{:else}
  <p class="hint">
    Diese Prüfung kontrolliert Adresse und Ports auf diesem Rechner. Etwaige Abweichungen die der
    Manager feststellt werden hier angezeigt.
  </p>
  <ul class="checklist network-bindings-list" id="network-bindings-panel">
    {#each checks as check (check.id)}
      <li class={check.ok ? 'network-binding-ok' : 'network-binding-bad'}>
        {check.ok ? '✓' : '✗'} {check.message}
      </li>
      {#if check.detail}
        <li class="network-binding-detail"><details><summary>Technische Details</summary>{check.detail}</details></li>
      {/if}
    {/each}
  </ul>
{/if}
