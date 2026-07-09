<script lang="ts">
  import type { NetworkSnapshot } from '../shared/host-status.js';
  import type { GatewayFieldState } from './host-network-panels.js';
  import { gatewayEnabledPatch } from './wizard-state.js';

  let {
    state,
    network,
    lanIpFallback,
    disabled = false,
    showIntro = false,
    radioName = 'network-gateway-interface',
    idPrefix = 'network',
    onChange,
  }: {
    state: GatewayFieldState;
    network: NetworkSnapshot | null;
    lanIpFallback: string;
    disabled?: boolean;
    showIntro?: boolean;
    radioName?: string;
    idPrefix?: string;
    onChange: (patch: Partial<GatewayFieldState>) => void;
  } = $props();

  const gatewayIpId = $derived(`${idPrefix}-gateway-ip`);
  const portalIpId = $derived(`${idPrefix}-portal-ip`);
  const authBridgeUrlId = $derived(`${idPrefix}-auth-bridge-url`);

  const composeSupported = $derived(network?.gatewayComposeSupported ?? true);
  const interfaceNames = $derived(new Set((network?.interfaces ?? []).map((iface) => iface.name)));
  const showCustomInterface = $derived(
    Boolean(
      state.gatewayInterface &&
        !interfaceNames.has(state.gatewayInterface) &&
        state.gatewayInterface !== 'eth1',
    ),
  );
</script>

{#if showIntro}
  <div class="wizard-gateway-intro">
    <p><strong>Wofür ist dieser Schritt?</strong></p>
    <p>
      Sie entscheiden, ob Praxis Flow Einstellungen für ein Gast-WLAN mit Captive Portal vorbereiten
      soll.
    </p>
    <ul class="wizard-gateway-intro-list">
      <li><strong>Aus:</strong> Kein Gast-WLAN — Normalfall für den Start.</li>
      <li>
        <strong>An:</strong> Werte für Gateway und Portal-URL werden gespeichert; Router und ggf.
        Gateway-Hardware richtet die IT separat ein.
      </li>
    </ul>
    <p>Das Patientenportal selbst aktivieren Sie später in Praxis Flow (Betrieb).</p>
  </div>
{/if}

<label class="wizard-radio">
  <input
    type="checkbox"
    checked={state.gatewayEnabled}
    {disabled}
    onchange={(event) => {
      const enabled = event.currentTarget.checked;
      onChange(gatewayEnabledPatch(state, enabled, network, lanIpFallback));
    }}
  />
  <span>Gast-WLAN / Patientenportal vorbereiten</span>
</label>

{#if state.gatewayEnabled && !composeSupported}
  <p class="hint">
    Auf diesem Rechner (macOS/Windows) startet kein Gateway — Werte nur speichern, für ein separates
    Linux-Gateway oder den späteren Feldtest.
  </p>
{/if}

{#if state.gatewayEnabled}
  <p class="hint">
    Netzwerkkarte am Gateway für das Gast-Netz (z. B. eth1). Ihre IT leitet den Gast-WLAN-Traffic
    dorthin.
  </p>

  <fieldset class="wizard-fieldset">
    {#each network?.interfaces ?? [] as iface (iface.name)}
      <label class="wizard-radio">
        <input
          type="radio"
          name={radioName}
          value={iface.name}
          checked={state.gatewayInterface === iface.name}
          {disabled}
          onchange={() => onChange({ gatewayInterface: iface.name })}
        />
        <span>
          {iface.name} — {iface.addresses.map((a) => a.address).join(', ') || 'keine IPv4'}
        </span>
      </label>
    {/each}

    {#if !interfaceNames.has('eth1')}
      <label class="wizard-radio">
        <input
          type="radio"
          name={radioName}
          value="eth1"
          checked={state.gatewayInterface === 'eth1'}
          {disabled}
          onchange={() => onChange({ gatewayInterface: 'eth1' })}
        />
        <span>eth1 (Standard, manuell)</span>
      </label>
    {/if}

    {#if showCustomInterface}
      <label class="wizard-radio">
        <input
          type="radio"
          name={radioName}
          value={state.gatewayInterface}
          checked
          {disabled}
          onchange={() => onChange({ gatewayInterface: state.gatewayInterface })}
        />
        <span>{state.gatewayInterface} (gespeichert)</span>
      </label>
    {/if}
  </fieldset>

  <label class="wizard-field-label" for={gatewayIpId}>IP des Gateways im Gast-Netz</label>
  <input
    id={gatewayIpId}
    type="text"
    class="wizard-input"
    placeholder="192.168.88.1"
    value={state.gatewayIp}
    {disabled}
    oninput={(event) => onChange({ gatewayIp: event.currentTarget.value })}
  />

  <label class="wizard-field-label" for={portalIpId}>Adresse der Praxis-App für Patienten</label>
  <input
    id={portalIpId}
    type="text"
    class="wizard-input"
    placeholder={lanIpFallback || '192.168.1.50'}
    value={state.portalAppIp}
    {disabled}
    oninput={(event) => onChange({ portalAppIp: event.currentTarget.value })}
  />

  <label class="wizard-field-label" for={authBridgeUrlId}>Adresse für Internetfreigabe</label>
  <input
    id={authBridgeUrlId}
    type="text"
    class="wizard-input"
    placeholder={network?.defaultGatewayBridgeUrl ?? 'http://<gateway-host>:9100'}
    value={state.authBridgeUrl}
    {disabled}
    oninput={(event) => onChange({ authBridgeUrl: event.currentTarget.value })}
  />

  <p class="hint">
    Nach gültiger Wartenummer löst Praxis Flow darüber die Internetfreigabe aus. Bei separatem
    Linux-Gateway: dessen von hier erreichbare Adresse eintragen.
  </p>

  <p class="hint">
    Noch nötig in der Praxis: Access Point / Gast-WLAN, Routing zum Gateway und ggf. das
    Linux-Gateway-Gerät. Details: Dokumentation „Guest-WLAN & Captive Portal“.
  </p>
{/if}
