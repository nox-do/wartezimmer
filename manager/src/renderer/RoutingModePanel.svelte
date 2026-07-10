<script lang="ts">
  import {
    buildRoutingModeOptions,
    formatRoutingModeMaintenanceFootnote,
  } from './routing-mode-ui.js';
  import type { RoutingMode } from '../shared/host-status.js';
  import { routingModeSaveDisabled } from './maintenance-view-model.js';

  let {
    routingMode,
    routingModeSaved,
    complexRoutingLicensed,
    openVisitCount = 0,
    statusText = '',
    busy = false,
    onChange,
    onSave,
  }: {
    routingMode: RoutingMode | null;
    routingModeSaved: RoutingMode | null;
    complexRoutingLicensed: boolean;
    openVisitCount?: number;
    statusText?: string;
    busy?: boolean;
    onChange: (routingMode: RoutingMode) => void;
    onSave: () => void;
  } = $props();

  const options = $derived(
    buildRoutingModeOptions('maintenance', complexRoutingLicensed, openVisitCount, routingModeSaved),
  );
  const saveDisabled = $derived(
    routingModeSaveDisabled(busy, routingMode, routingModeSaved, openVisitCount),
  );
  const footnote = $derived(formatRoutingModeMaintenanceFootnote(openVisitCount));
</script>

<div class="panel-section">
  <h2>Routing-Modus</h2>
  <div class="routing-mode-intro">
    <p><strong>Wohin soll der Patient nach dem Check-in?</strong></p>
    <p>
      Praxis Flow steuert den Weg vom Terminal über Wartezimmer und Aufruf bis zum Zielraum.
    </p>
  </div>
  <fieldset class="routing-mode-card-fieldset" disabled={busy}>
    {#each options as option (option.value)}
      <label
        class="routing-mode-card"
        class:is-selected={routingMode === option.value}
        class:is-disabled={option.disabled}
      >
        <input
          type="radio"
          class="routing-mode-card-input"
          name="routing-mode"
          value={option.value}
          checked={routingMode === option.value}
          disabled={busy || option.disabled}
          onchange={() => onChange(option.value)}
        />
        <span class="routing-mode-card-body">
          <span class="routing-mode-card-head">
            <span class="routing-mode-card-title">{option.label}</span>
            {#if option.recommended}
              <span class="routing-mode-recommended-badge">empfohlen</span>
            {/if}
            {#if option.pro}
              <span class="routing-mode-pro-badge">Pro</span>
            {/if}
          </span>
          <span class="routing-mode-card-hint">{option.hint}</span>
        </span>
      </label>
    {/each}
    {#if !complexRoutingLicensed}
      <p class="hint">
        Complex Routing erfordert eine Pro-Lizenz. Simple ist der Standard für normale Praxen.
      </p>
    {/if}
  </fieldset>
  <p class="hint routing-mode-footnote" role="status">{footnote}</p>
  <div class="actions-row">
    <button type="button" class="btn-secondary" disabled={saveDisabled} onclick={onSave}>
      Routing-Modus speichern
    </button>
  </div>
  {#if statusText}
    <p class="maintenance-backup-status">{statusText}</p>
  {/if}
</div>
