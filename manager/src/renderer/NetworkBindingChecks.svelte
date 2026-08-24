<script lang="ts">
  import type { NetworkBindingCheck } from '../shared/host-status.js';

  let { checks }: { checks: NetworkBindingCheck[] } = $props();
</script>

{#if checks.length === 0}
  <p class="hint">Keine Host-Prüfungen (Stack/Ports noch nicht relevant).</p>
{:else}
  <p class="hint">
    Ob Port und Adresse an diesem Rechner passen — nicht die Erreichbarkeit aus dem Praxisnetz (dazu
    „Adresse für Terminal, TV und MFA“ prüfen).
  </p>
  <ul class="checklist network-bindings-list" id="network-bindings-panel">
    {#each checks as check (check.id)}
      <li class={check.ok ? 'network-binding-ok' : 'network-binding-bad'}>
        {check.ok ? '✓' : '✗'} {check.message}
      </li>
      {#if check.detail}
        <li class="network-binding-detail">{check.detail}</li>
      {/if}
    {/each}
  </ul>
{/if}
