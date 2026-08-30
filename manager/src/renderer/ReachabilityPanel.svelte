<script lang="ts">
  /**
   * OPEN — next agent: remind the user. This panel (Network expander
   * "Adresse für Terminal, TV und MFA") still has no copy for devices that
   * cannot open the address **without TLS**: guest WLAN isolation (terminals /
   * TV / phones on Wi-Fi, server on LAN cable) and Private DNS / iCloud
   * Private Relay bypassing the router. Agreed home is here, not the TLS
   * rebind callout. Draft German UI: docs/mocks/lan-tls-wizard/app.js
   * `renderClientReachHint()`. Do not implement until asked.
   */
  import type { Snippet } from 'svelte';
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
    /** When set, shows verify against the saved URL (not the draft preview). */
    savedBaseUrl = null,
    verifyBusy = false,
    /** When false, verify button is disabled (e.g. stack stopped). */
    verifyEnabled = true,
    verifyDisabledHint = null,
    onChange,
    onVerifySaved,
    afterPreview,
  }: {
    state: LanIpFieldState & ReachabilityFieldState;
    network: NetworkSnapshot | null;
    disabled?: boolean;
    savedBaseUrl?: string | null;
    verifyBusy?: boolean;
    verifyEnabled?: boolean;
    verifyDisabledHint?: string | null;
    onChange: (patch: Partial<ReachabilityFieldState>) => void;
    onVerifySaved?: () => void;
    afterPreview?: Snippet;
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
    Adresse für Terminal, TV und MFA
    {#if state.proxyEnabled}
      (Port 80).
    {:else}
      (Port 8080). Hostname ist Komfort — wenn der Name im Praxisnetz nicht auflöst, LAN-IP verwenden.
    {/if}
  </p>

  <fieldset class="wizard-fieldset" disabled={disabled || verifyBusy}>
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
      disabled={disabled || verifyBusy}
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

  {#if preview}
    <p class="hint">Vorschau (Entwurf): <code>{preview}</code></p>
  {/if}

  {@render afterPreview?.()}

  {#if savedBaseUrl && onVerifySaved}
    <p class="hint">Gespeichert: <code>{savedBaseUrl}</code></p>
    {#if !verifyEnabled && verifyDisabledHint}
      <p class="hint">{verifyDisabledHint}</p>
    {:else}
      <div class="actions-row">
        <button
          type="button"
          class="btn-secondary"
          disabled={disabled || verifyBusy || !verifyEnabled}
          onclick={onVerifySaved}
        >
          {verifyBusy ? 'Prüfe …' : 'Gespeicherte Adresse erneut prüfen'}
        </button>
      </div>
    {/if}
  {/if}
</div>
