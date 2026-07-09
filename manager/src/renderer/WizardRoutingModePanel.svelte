<script lang="ts">
  import {
    ROUTING_MODE_WIZARD_FOOTNOTE,
    ROUTING_MODE_WIZARD_INTRO_DETAIL,
    ROUTING_MODE_WIZARD_INTRO_LEAD,
    buildRoutingModeOptions,
  } from './routing-mode-ui.js';
  import type { RoutingMode } from '../shared/host-status.js';

  let {
    routingMode,
    complexRoutingLicensed,
    busy = false,
    onChange,
  }: {
    routingMode: RoutingMode | null;
    complexRoutingLicensed: boolean;
    busy?: boolean;
    onChange: (routingMode: RoutingMode) => void;
  } = $props();

  const options = $derived(buildRoutingModeOptions('wizard', complexRoutingLicensed));
</script>

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
        name="wizard-routing-mode"
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
    <p class="wizard-hint">
      Complex Routing erfordert eine Pro-Lizenz. Simple ist der Standard für normale Praxen.
    </p>
  {/if}
</fieldset>
<p class="wizard-hint routing-mode-footnote">{ROUTING_MODE_WIZARD_FOOTNOTE}</p>
