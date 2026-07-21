<script lang="ts">
  import type { NetworkSnapshot } from '../shared/host-status.js';
  import type { ReachabilityFieldState, ReachabilityMode } from './reachability.js';
  import {
    draftCanonicalBaseUrl,
    fallbackLanBaseUrl,
    hostnameBaseUrl,
    productPublishPort,
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
    showProxyToggle = true,
    onChange,
    onTest,
  }: {
    state: LanIpFieldState & ReachabilityFieldState;
    network: NetworkSnapshot | null;
    disabled?: boolean;
    probeBusy?: boolean;
    probeMessage?: string | null;
    probeOk?: boolean | null;
    /** Network tab keeps the toggle under Netzwerk-Einstellungen; wizard shows it on Zugang. */
    showProxyToggle?: boolean;
    onChange: (patch: Partial<ReachabilityFieldState>) => void;
    onTest: () => void;
  } = $props();

  const lanIp = $derived(resolvedLanIp(state));
  const machineHostname = $derived(network?.machineHostname?.trim() || '');
  const publishPort = $derived(productPublishPort(state.proxyEnabled));
  const preview = $derived(draftCanonicalBaseUrl(state, network));

  function selectMode(mode: ReachabilityMode): void {
    onChange({ reachabilityMode: mode });
  }
</script>

<div class="reachability-panel">
  <p class="hint">
    {#if state.proxyEnabled}
      Basis-URL für Terminal, TV, MFA und Ops im Praxisnetz über den Reverse Proxy (Port 80). Der
      direkte App-Port bleibt lokal unter <code>127.0.0.1:8080</code> erreichbar.
    {:else}
      Basis-URL für Terminal, TV, MFA und Ops im Praxisnetz (Port 8080). Hostname ist Komfort — wenn
      der Name im LAN nicht auflöst, LAN-IP verwenden.
    {/if}
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
          <span class="hint">({fallbackLanBaseUrl(lanIp, publishPort)})</span>
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
          <span class="hint">({hostnameBaseUrl(machineHostname, publishPort)})</span>
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
    <p class="hint">
      {#if state.proxyEnabled}
        Wird als <code>http://&lt;name&gt;</code> (Port 80) gespeichert.
      {:else}
        Wird als <code>http://&lt;name&gt;:8080</code> gespeichert.
      {/if}
    </p>
  {/if}

  {#if showProxyToggle}
    <label class="wizard-checkbox">
      <input
        type="checkbox"
        checked={state.proxyEnabled}
        disabled={disabled || probeBusy}
        onchange={(event) =>
          onChange({ proxyEnabled: (event.currentTarget as HTMLInputElement).checked })}
      />
      <span>Zugriff über Reverse Proxy auf Port 80</span>
    </label>
    {#if state.proxyEnabled}
      <p class="hint">
        Direkter App-Port bleibt lokal unter <code>127.0.0.1:8080</code> erreichbar.
      </p>
    {/if}
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
</div>
