<script lang="ts">
  import { stackStatusLabel } from './maintenance-view-model.js';
  import type { ComposeStatus } from '../shared/host-status.js';

  let {
    compose,
    locked = false,
    error = null,
    onToggle,
    onRestart,
  }: {
    compose: ComposeStatus | null;
    locked?: boolean;
    error?: string | null;
    onToggle: (wantRunning: boolean) => void;
    onRestart: () => void;
  } = $props();

  const running = $derived(compose?.running ?? false);
  const partial = $derived(!running && Boolean(compose?.services.some((service) => service.state.toLowerCase().includes('running'))));
</script>

<div class="panel-section">
  <h2>Praxis-Flow-Dienste</h2>
  <div class="actions-row">
    <label class="stack-toggle">
      <span class="toggle-switch">
        <input
          type="checkbox"
          role="switch"
          checked={running}
          disabled={locked}
          aria-describedby="maintenance-stack-status"
          onchange={(event) => {
            const input = event.currentTarget;
            const wantRunning = input.checked;
            if (!wantRunning) {
              input.checked = true;
            }
            onToggle(wantRunning);
          }}
        />
        <span class="toggle-track" aria-hidden="true"></span>
      </span>
      <span id="maintenance-stack-status" class="stack-toggle-status">{partial ? 'Teilweise gestartet' : stackStatusLabel(running)}</span>
    </label>
    <button type="button" class="btn-secondary" disabled={locked} onclick={onRestart}>Neustart</button>
  </div>
  <p class="hint">Sind die Dienste gestoppt, entspricht Neustart einem Start.</p>
  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>
