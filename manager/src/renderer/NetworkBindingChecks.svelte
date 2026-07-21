<script lang="ts">
  import type { NetworkBindingCheck } from '../shared/host-status.js';

  let { checks }: { checks: NetworkBindingCheck[] | null | undefined } = $props();
</script>

{#if checks && checks.length > 0}
  <div id="network-bindings-panel">
    <h3 class="wizard-subheading network-bindings-title">Prüfungen am Rechner</h3>
    <p class="hint">
      Ob Port und Adresse an diesem Rechner passen — nicht die Erreichbarkeit aus dem Praxisnetz.
    </p>
    <ul class="checklist network-bindings-list">
      {#each checks as check (check.message)}
        <li class={check.ok ? 'network-binding-ok' : 'network-binding-bad'}>
          {check.ok ? '✓' : '✗'} {check.message}
        </li>
        {#if check.detail}
          <li class="network-binding-detail">{check.detail}</li>
        {/if}
      {/each}
    </ul>
  </div>
{/if}
