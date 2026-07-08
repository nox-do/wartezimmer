<script lang="ts">
  import {
    stackStatusLabel,
    showRestartBuildButton,
  } from './maintenance-view-model.js';
  import type { HostStatus } from '../shared/host-status.js';
  import type { ComposeStatus } from '../shared/host-status.js';

  let {
    status,
    compose,
    busy = false,
    onToggle,
    onRestartBuild,
    onRestart,
  }: {
    status: HostStatus | null;
    compose: ComposeStatus | null;
    busy?: boolean;
    onToggle: (wantRunning: boolean) => void;
    onRestartBuild: () => void;
    onRestart: () => void;
  } = $props();

  const running = $derived(compose?.running ?? false);
</script>

<div class="maintenance-section">
  <h2>Stack</h2>
  <div class="maintenance-actions">
    <label class="stack-toggle">
      <span class="toggle-switch">
        <input
          type="checkbox"
          role="switch"
          checked={running}
          disabled={busy}
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
      <span id="maintenance-stack-status" class="stack-toggle-status">{stackStatusLabel(running)}</span>
    </label>
    {#if showRestartBuildButton(status?.mode)}
      <button type="button" class="btn-secondary" disabled={busy} onclick={onRestartBuild}>
        Neu bauen &amp; starten
      </button>
    {/if}
    <button type="button" class="btn-secondary" disabled={busy} onclick={onRestart}>Neustart</button>
  </div>
  <p class="wizard-hint">Ist der Stack gestoppt, entspricht Neustart einem Start.</p>
</div>
