<script lang="ts">
  import type { NetworkBindingCheck } from '../shared/host-status.js';

  let { checks }: { checks: NetworkBindingCheck[] | null | undefined } = $props();
</script>

{#if checks && checks.length > 0}
  <div id="network-bindings-panel">
    <h3 class="wizard-subheading network-bindings-title">Bindung & Listener (Host)</h3>
    <p class="maintenance-hint">
      Prüft am Host Interfaces, IPs und Ports — ob die Konfiguration zum laufenden Stack passt. Kein
      Test, ob Patienten-Traffic wirklich nur über den Gast-Anschluss kommt (dafür VLAN/Routing in
      der Praxis).
    </p>
    <ul class="wizard-checklist network-bindings-list">
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
