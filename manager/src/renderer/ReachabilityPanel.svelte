<script lang="ts">
  import type { NetworkSnapshot } from '../shared/host-status.js';
  import type { ReachabilityFieldState, ReachabilityMode } from './reachability.js';
  import {
    draftCanonicalBaseUrl,
    fallbackLanBaseUrl,
    hostnameBaseUrl,
  } from './reachability.js';
  import type { LanIpFieldState } from './host-network-panels.js';
  import { resolvedLanIp } from './wizard-state.js';

  let {
    state,
    network,
    disabled = false,
    probeBusy = false,
    probeMessage = null,
    probeOk = null,
    onChange,
    onTest,
  }: {
    state: LanIpFieldState & ReachabilityFieldState;
    network: NetworkSnapshot | null;
    disabled?: boolean;
    probeBusy?: boolean;
    probeMessage?: string | null;
    probeOk?: boolean | null;
    onChange: (patch: Partial<ReachabilityFieldState>) => void;
    onTest: () => void;
  } = $props();

  const lanIp = $derived(resolvedLanIp(state));
  const machineHostname = $derived(network?.machineHostname?.trim() || '');
  const preview = $derived(draftCanonicalBaseUrl(state, network));

  function selectMode(mode: ReachabilityMode): void {
    onChange({ reachabilityMode: mode });
  }
</script>

<div class="reachability-panel">
  <p class="hint">
    Basis-URL für Terminal, TV, MFA, Ops und Portal. Hostname ist Komfort — wenn der Name im LAN
    nicht auflöst, LAN-IP verwenden. Port ist aktuell immer 8080.
  </p>

  <fieldset class="wizard-fieldset" disabled={disabled || probeBusy}>
    <legend class="lan-ip-prompt">Wie soll Praxis Flow im Praxisnetz erreichbar sein?</legend>

    <label class="wizard-radio">
      <input
        type="radio"
        name="reachability-mode"
        checked={state.reachabilityMode === 'lan-ip'}
        onchange={() => selectMode('lan-ip')}
      />
      <span>
        LAN-IP verwenden
        {#if lanIp}
          <span class="hint">({fallbackLanBaseUrl(lanIp)})</span>
        {/if}
      </span>
    </label>

    <label class="wizard-radio">
      <input
        type="radio"
        name="reachability-mode"
        checked={state.reachabilityMode === 'hostname'}
        disabled={!machineHostname}
        onchange={() => selectMode('hostname')}
      />
      <span>
        Rechnernamen versuchen
        {#if machineHostname}
          <span class="hint">({hostnameBaseUrl(machineHostname)})</span>
        {:else}
          <span class="hint">(kein Hostname erkannt)</span>
        {/if}
      </span>
    </label>

    <label class="wizard-radio">
      <input
        type="radio"
        name="reachability-mode"
        checked={state.reachabilityMode === 'custom'}
        onchange={() => selectMode('custom')}
      />
      <span>Eigener Hostname / Domain</span>
    </label>
  </fieldset>

  {#if state.reachabilityMode === 'custom'}
    <label class="wizard-field-label" for="reachability-custom-host">Hostname oder Domain</label>
    <input
      id="reachability-custom-host"
      class="wizard-input"
      type="text"
      placeholder="praxis-flow.local"
      value={state.customHostname}
      disabled={disabled || probeBusy}
      oninput={(event) =>
        onChange({ customHostname: (event.currentTarget as HTMLInputElement).value })}
    />
    <p class="hint">Wird als <code>http://&lt;name&gt;:8080</code> gespeichert.</p>
  {/if}

  {#if preview}
    <p class="hint">Vorschau Geräte-Basis: <code>{preview}</code></p>
  {/if}

  <div class="actions-row">
    <button
      type="button"
      class="btn-secondary"
      disabled={disabled || probeBusy || !preview}
      onclick={onTest}
    >
      {probeBusy ? 'Prüfe …' : 'Erreichbarkeit testen'}
    </button>
  </div>

  {#if probeMessage}
    <p class={probeOk === false ? 'error' : 'hint'}>{probeMessage}</p>
  {/if}

  <p class="hint">
    Gast-WLAN / Captive Portal bleibt getrennt (unten) — dort kann die Portal-Adresse von dieser
    Basis abweichen.
  </p>
</div>
